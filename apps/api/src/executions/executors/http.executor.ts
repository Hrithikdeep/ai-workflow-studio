import { Injectable, Logger } from '@nestjs/common';
import { ExecutionStepStatus } from '@prisma/client';

import type {
  ExecutorNode,
  NodeExecutionContext,
  NodeExecutionResult,
} from './node-executor';

const DEFAULT_TIMEOUT_MS = 15_000;
/** Cap the response text stored on the execution record. */
const MAX_RESPONSE_BYTES = 64 * 1024;
const ALLOWED_METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);
/** Header names whose values must never reach the execution record / logs. */
const SENSITIVE_HEADER =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-auth-token|x-amz-security-token)$/i;

/**
 * Executes an `HTTP_REQUEST` workflow node using its inline configuration
 * (`method`, `url`, `headers`, `body`). All `{{ }}` templates are already
 * resolved upstream by `resolveNodeConfig` before this runs.
 *
 * Request credentials (an `Authorization` header, an API key, …) are used
 * only for the outgoing request. They are redacted from the echoed config,
 * never appear in the node result, thrown errors, or logs.
 */
@Injectable()
export class HttpNodeExecutor {
  private readonly logger = new Logger(HttpNodeExecutor.name);

  async execute(
    node: ExecutorNode,
    resolvedConfig: Record<string, unknown>,
    _context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> {
    void _context;

    const method = (str(resolvedConfig.method) || 'GET').toUpperCase();
    const url = str(resolvedConfig.url);
    const parsedHeaders = parseHeaders(resolvedConfig.headers);
    const bodyText =
      resolvedConfig.body == null
        ? ''
        : typeof resolvedConfig.body === 'string'
          ? resolvedConfig.body
          : safeStringify(resolvedConfig.body);

    // Echoed into the execution log — sensitive header values are masked and
    // any URL userinfo (user:pass@host) is stripped.
    const safeConfig = {
      method,
      url: redactUrl(url),
      headers: redactHeaders(parsedHeaders.ok ? parsedHeaders.value : {}),
      hasBody: bodyText.trim() !== '',
    };

    const fail = (error: string, code: string): NodeExecutionResult => ({
      status: ExecutionStepStatus.FAILED,
      output: {
        nodeId: node.id,
        nodeType: 'HTTP_REQUEST',
        label: node.label,
        config: safeConfig,
        code,
        status: 'FAILED',
      },
      error,
      branch: null,
    });

    const finish = (
      stepStatus: ExecutionStepStatus,
      http: Record<string, unknown>,
      error: string | null,
      code?: string,
    ): NodeExecutionResult => ({
      status: stepStatus,
      output: {
        nodeId: node.id,
        nodeType: 'HTTP_REQUEST',
        label: node.label,
        config: safeConfig,
        http,
        ...(code ? { code } : {}),
        status:
          stepStatus === ExecutionStepStatus.SUCCEEDED ? 'SUCCEEDED' : 'FAILED',
      },
      error,
      branch: null,
    });

    if (!ALLOWED_METHODS.has(method)) {
      return fail(`HTTP method "${method}" is not supported.`, 'INVALID_METHOD');
    }
    if (!url) {
      return fail('A request URL is required.', 'MISSING_CONFIG');
    }

    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return fail('The request URL is not valid.', 'INVALID_URL');
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return fail('Only http and https URLs are supported.', 'INVALID_URL');
    }
    if (!parsedHeaders.ok) {
      return fail(
        'Request headers must be a JSON object of string values.',
        'INVALID_HEADERS',
      );
    }

    const sendsBody = method !== 'GET' && method !== 'HEAD';
    const requestInit: RequestInit = {
      method,
      headers: parsedHeaders.value,
      signal: AbortSignal.timeout(timeoutMs()),
    };
    if (sendsBody && bodyText !== '') {
      requestInit.body = bodyText;
    }

    let res: Response;
    try {
      res = await fetch(target, requestInit);
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      const timedOut = name === 'TimeoutError' || name === 'AbortError';
      this.logger.warn(
        `HTTP node ${node.id}: request ${timedOut ? 'timed out' : 'failed'}`,
      );
      return timedOut
        ? fail('The HTTP request timed out.', 'TIMEOUT')
        : fail('Could not reach the request URL.', 'NETWORK');
    }

    // Some endpoints reflect request headers back in their response body
    // (e.g. debug/echo services). Mask the exact secret values we just sent
    // so a redacted request header cannot reappear verbatim in the stored
    // response.
    const sentSecrets = sensitiveValues(parsedHeaders.value);
    const { text, truncated } = await readCapped(res);
    const safeText = maskAll(text, sentSecrets);
    const http = {
      status: res.status,
      statusText: res.statusText,
      headers: redactHeaders(headerObject(res.headers)),
      body: parseBody(safeText),
      truncated,
    };

    if (res.ok) {
      return finish(ExecutionStepStatus.SUCCEEDED, http, null);
    }

    this.logger.warn(`HTTP node ${node.id}: response status ${res.status}`);
    return finish(
      ExecutionStepStatus.FAILED,
      http,
      `The request failed with status ${res.status}.`,
      `HTTP_${res.status}`,
    );
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function timeoutMs(): number {
  const raw = Number(process.env.HTTP_EXECUTOR_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : DEFAULT_TIMEOUT_MS;
}

function maxBytes(): number {
  const raw = Number(process.env.HTTP_EXECUTOR_MAX_RESPONSE_BYTES);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : MAX_RESPONSE_BYTES;
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

type ParsedHeaders =
  | { ok: true; value: Record<string, string> }
  | { ok: false; value?: undefined };

/** Accept a headers object or a JSON string; coerce values to strings. */
function parseHeaders(raw: unknown): ParsedHeaders {
  if (raw == null || raw === '') return { ok: true, value: {} };

  let source: unknown = raw;
  if (typeof raw === 'string') {
    try {
      source = JSON.parse(raw);
    } catch {
      return { ok: false };
    }
  }
  if (
    source === null ||
    typeof source !== 'object' ||
    Array.isArray(source)
  ) {
    return { ok: false };
  }

  const value: Record<string, string> = {};
  for (const [key, v] of Object.entries(source as Record<string, unknown>)) {
    if (v == null) continue;
    if (typeof v === 'object') return { ok: false };
    value[key] = String(v);
  }
  return { ok: true, value };
}

function redactHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADER.test(key) ? '***' : value;
  }
  return out;
}

/** The non-empty values of headers whose name marks them sensitive. */
function sensitiveValues(headers: Record<string, string>): string[] {
  const values: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADER.test(key) && value !== '') values.push(value);
  }
  return values;
}

function maskAll(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join('***');
  }
  return out;
}

function headerObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/** Strip `user:pass@` userinfo so a credential in the URL is not echoed. */
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = '';
      u.password = '';
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

async function readCapped(
  res: Response,
): Promise<{ text: string; truncated: boolean }> {
  let full: string;
  try {
    full = await res.text();
  } catch {
    return { text: '', truncated: false };
  }
  const cap = maxBytes();
  if (Buffer.byteLength(full, 'utf8') <= cap) {
    return { text: full, truncated: false };
  }
  return { text: Buffer.from(full, 'utf8').subarray(0, cap).toString('utf8'), truncated: true };
}

function parseBody(text: string): unknown {
  if (text === '') return '';
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
