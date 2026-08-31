import { Injectable, Logger } from '@nestjs/common';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

import { Client as PgClient } from 'pg';

import type { IntegrationProvider } from './integration-providers';

/**
 * Result of a provider connection probe. Contains no secret material and a
 * sanitized `message` safe to return to the client.
 *
 * - `ok: true`  -> connection verified; caller sets status `connected`
 * - `ok: false` -> probe failed OR could not run; caller sets status
 *                  `error` only when `reachable` is explicitly false
 */
export interface ProbeResult {
  ok: boolean;
  /** machine-readable outcome code */
  code:
    | 'OK'
    | 'MISSING_CONFIG'
    | 'MISSING_CREDENTIAL'
    | 'AUTH_FAILED'
    | 'RATE_LIMITED'
    | 'UNREACHABLE'
    | 'BLOCKED'
    | 'TIMEOUT'
    | 'NOT_SUPPORTED_YET'
    | 'PROBE_ERROR';
  message: string;
  /** non-secret extras, e.g. { httpStatus: 200 } or { team: 'Acme' } */
  detail?: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 8000;

@Injectable()
export class IntegrationProbeService {
  private readonly logger = new Logger(IntegrationProbeService.name);

  /**
   * Run the connection probe for `provider`. `config` is the non-secret
   * config; `secrets` is the decrypted secret payload (never logged, never
   * returned).
   */
  async probe(
    provider: IntegrationProvider,
    config: Record<string, unknown>,
    secrets: Record<string, unknown>,
    options: { timeoutMs?: number } = {},
  ): Promise<ProbeResult> {
    const timeoutMs = clampTimeout(options.timeoutMs);

    try {
      switch (provider) {
        case 'http':
          return await this.probeHttp(config, secrets, timeoutMs);
        case 'slack':
          return await this.probeSlack(secrets, timeoutMs);
        case 'webhook':
          return this.probeWebhook(config, secrets);
        case 'postgresql':
          return await this.probePostgres(config, secrets, timeoutMs);
        case 'gmail':
          return this.probeGmail(secrets);
        case 'openai':
          return await this.probeOpenAi(secrets, timeoutMs);
        default:
          return {
            ok: false,
            code: 'NOT_SUPPORTED_YET',
            message: `No connection test is available for "${provider}".`,
          };
      }
    } catch (error) {
      this.logger.warn(
        `Probe for ${provider} threw: ${
          error instanceof Error ? error.name : 'unknown error'
        }`,
      );
      return {
        ok: false,
        code: 'PROBE_ERROR',
        message: 'The connection test could not be completed.',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // HTTP: GET the configured base URL with a timeout and an SSRF guard.
  // ---------------------------------------------------------------------------
  private async probeHttp(
    config: Record<string, unknown>,
    secrets: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ProbeResult> {
    const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl : '';
    if (!baseUrl) {
      return {
        ok: false,
        code: 'MISSING_CONFIG',
        message: 'Set a base URL before testing this integration.',
      };
    }

    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      return {
        ok: false,
        code: 'MISSING_CONFIG',
        message: 'The configured base URL is not a valid URL.',
      };
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return {
        ok: false,
        code: 'BLOCKED',
        message: 'Only http(s) URLs can be tested.',
      };
    }
    if (url.username || url.password) {
      return {
        ok: false,
        code: 'BLOCKED',
        message: 'Credentials in the URL are not allowed; use the credential field.',
      };
    }
    if (await isDisallowedHost(url.hostname)) {
      return {
        ok: false,
        code: 'BLOCKED',
        message: 'The configured host resolves to a private or reserved address.',
      };
    }

    const headers: Record<string, string> = { 'user-agent': 'ai-workflow-studio/probe' };
    applyHttpAuth(headers, config, secrets);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });
      const reachable = res.status < 500;
      return {
        ok: reachable,
        code: reachable ? 'OK' : 'UNREACHABLE',
        message: reachable
          ? `Reached ${url.origin} (HTTP ${res.status}).`
          : `Endpoint responded with HTTP ${res.status}.`,
        detail: { httpStatus: res.status },
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        ok: false,
        code: aborted ? 'TIMEOUT' : 'UNREACHABLE',
        message: aborted
          ? `No response within ${timeoutMs}ms.`
          : `Could not reach ${url.origin}.`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------------------
  // Slack: real call to auth.test with the configured bot token.
  // ---------------------------------------------------------------------------
  private async probeSlack(
    secrets: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ProbeResult> {
    const token = firstString(secrets.botToken, secrets.credential);
    if (!token) {
      return {
        ok: false,
        code: 'MISSING_CREDENTIAL',
        message: 'Add a Slack bot token before testing this integration.',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        team?: string;
        error?: string;
      };
      if (body.ok) {
        return {
          ok: true,
          code: 'OK',
          message: body.team
            ? `Authenticated with Slack workspace "${body.team}".`
            : 'Authenticated with Slack.',
          detail: body.team ? { team: body.team } : undefined,
        };
      }
      return {
        ok: false,
        code: 'AUTH_FAILED',
        message: `Slack rejected the token${
          body.error ? ` (${sanitizeProviderError(body.error)})` : ''
        }.`,
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        ok: false,
        code: aborted ? 'TIMEOUT' : 'UNREACHABLE',
        message: aborted
          ? `Slack did not respond within ${timeoutMs}ms.`
          : 'Could not reach the Slack API.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------------------
  // OpenAI: real authenticated call to GET /v1/models with the stored API key.
  // This is the cheapest endpoint that proves the key is valid — it lists
  // models, consumes no tokens, and returns 401 for a bad key. The key is
  // only ever placed on the Authorization header of this outbound request;
  // it is never logged, returned, or stored anywhere but the existing
  // encrypted IntegrationCredential.
  // ---------------------------------------------------------------------------
  private async probeOpenAi(
    secrets: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ProbeResult> {
    const apiKey = firstString(secrets.apiKey);
    if (!apiKey) {
      return {
        ok: false,
        code: 'MISSING_CREDENTIAL',
        message: 'Add an OpenAI API key before testing this integration.',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'user-agent': 'ai-workflow-studio/probe',
        },
        signal: controller.signal,
      });

      if (res.ok) {
        let modelCount: number | undefined;
        try {
          const body = (await res.json()) as { data?: unknown };
          if (Array.isArray(body?.data)) {
            modelCount = body.data.length;
          }
        } catch {
          // A 200 with an unreadable body still means the key authenticated.
        }
        return {
          ok: true,
          code: 'OK',
          message:
            typeof modelCount === 'number'
              ? `Authenticated with OpenAI (${modelCount} models available).`
              : 'Authenticated with OpenAI.',
          detail: { httpStatus: res.status },
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          code: 'AUTH_FAILED',
          message: 'OpenAI rejected the API key.',
          detail: { httpStatus: res.status },
        };
      }
      if (res.status === 429) {
        return {
          ok: false,
          code: 'RATE_LIMITED',
          message:
            'OpenAI rate-limited the connection test (rate limit or quota exceeded). Try again shortly.',
          detail: { httpStatus: res.status },
        };
      }
      if (res.status >= 500) {
        return {
          ok: false,
          code: 'UNREACHABLE',
          message: `OpenAI is currently unavailable (HTTP ${res.status}).`,
          detail: { httpStatus: res.status },
        };
      }
      return {
        ok: false,
        code: 'PROBE_ERROR',
        message: `OpenAI returned an unexpected response (HTTP ${res.status}).`,
        detail: { httpStatus: res.status },
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        ok: false,
        code: aborted ? 'TIMEOUT' : 'UNREACHABLE',
        message: aborted
          ? `OpenAI did not respond within ${timeoutMs}ms.`
          : 'Could not reach the OpenAI API.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------------------
  // Webhook: readiness check only. Never sends anything outbound.
  // ---------------------------------------------------------------------------
  private probeWebhook(
    _config: Record<string, unknown>,
    secrets: Record<string, unknown>,
  ): ProbeResult {
    const signingSecret = firstString(secrets.signingSecret, secrets.credential);
    if (!signingSecret) {
      return {
        ok: false,
        code: 'MISSING_CREDENTIAL',
        message:
          'Add a signing secret so inbound webhook requests can be verified.',
      };
    }
    return {
      ok: true,
      code: 'OK',
      message: 'Signing secret is configured. This integration is ready to receive webhooks.',
    };
  }

  // ---------------------------------------------------------------------------
  // PostgreSQL: real connection + SELECT 1.
  // ---------------------------------------------------------------------------
  private async probePostgres(
    config: Record<string, unknown>,
    secrets: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ProbeResult> {
    const connectionString = firstString(secrets.connectionString);
    const password = firstString(secrets.password, secrets.credential);
    const host = firstString(config.host);
    const database = firstString(config.database);

    if (!connectionString && (!host || !database)) {
      return {
        ok: false,
        code: 'MISSING_CONFIG',
        message:
          'Provide a connection string, or a host and database, before testing.',
      };
    }
    if (!connectionString && !password) {
      return {
        ok: false,
        code: 'MISSING_CREDENTIAL',
        message: 'Add the database password before testing this integration.',
      };
    }

    const sslMode = firstString(config.ssl);
    const client = new PgClient(
      connectionString
        ? {
            connectionString,
            connectionTimeoutMillis: timeoutMs,
            ssl: sslMode === 'require' ? { rejectUnauthorized: false } : undefined,
            statement_timeout: timeoutMs,
          }
        : {
            host,
            port: toPort(config.port),
            database,
            user: firstString(config.username) ?? undefined,
            password,
            connectionTimeoutMillis: timeoutMs,
            ssl: sslMode === 'require' ? { rejectUnauthorized: false } : undefined,
            statement_timeout: timeoutMs,
          },
    );

    try {
      await client.connect();
      await client.query('SELECT 1');
      return {
        ok: true,
        code: 'OK',
        message: 'Connected and ran SELECT 1 successfully.',
      };
    } catch (error) {
      return {
        ok: false,
        code: 'UNREACHABLE',
        message: `Could not connect to PostgreSQL: ${sanitizeProviderError(
          error instanceof Error ? error.message : 'connection failed',
        )}`,
      };
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------------------
  // Gmail: OAuth path is a later step. Report honestly; do not fake success.
  // ---------------------------------------------------------------------------
  private probeGmail(secrets: Record<string, unknown>): ProbeResult {
    const hasSecret = Boolean(
      firstString(secrets.refreshToken, secrets.appPassword, secrets.credential),
    );
    return {
      ok: false,
      code: 'NOT_SUPPORTED_YET',
      message: hasSecret
        ? 'A Gmail credential is stored, but live connection testing requires the Gmail OAuth setup added in a later step.'
        : 'Gmail connection testing requires the OAuth / credential setup added in a later step.',
    };
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function clampTimeout(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(30000, Math.max(1000, Math.trunc(value)));
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }
  return undefined;
}

function toPort(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : undefined;
}

function applyHttpAuth(
  headers: Record<string, string>,
  config: Record<string, unknown>,
  secrets: Record<string, unknown>,
): void {
  const authType = typeof config.authType === 'string' ? config.authType : 'None';
  const bearer = firstString(secrets.bearerToken, secrets.credential);
  const apiKey = firstString(secrets.apiKey);
  const basicPass = firstString(secrets.basicAuthPassword, secrets.credential);

  if (authType === 'Bearer Token' && bearer) {
    headers.authorization = `Bearer ${bearer}`;
  } else if (authType === 'API Key' && apiKey) {
    headers.authorization = apiKey;
  } else if (authType === 'Basic' && basicPass) {
    const user = firstString(config.username) ?? '';
    headers.authorization = `Basic ${Buffer.from(`${user}:${basicPass}`).toString(
      'base64',
    )}`;
  }
}

/** Reject loopback / private / link-local / reserved destinations. */
async function isDisallowedHost(hostname: string): Promise<boolean> {
  const lowered = hostname.toLowerCase();
  if (
    lowered === 'localhost' ||
    lowered === 'ip6-localhost' ||
    lowered.endsWith('.localhost') ||
    lowered.endsWith('.local') ||
    lowered.endsWith('.internal')
  ) {
    return true;
  }

  const literals: string[] = [];
  if (isIP(hostname)) {
    literals.push(hostname);
  } else {
    try {
      const records = await lookup(hostname, { all: true });
      literals.push(...records.map((r) => r.address));
    } catch {
      // If it does not resolve, let fetch fail normally rather than block.
      return false;
    }
  }

  return literals.some(isPrivateAddress);
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const v6 = address.toLowerCase();
  return (
    v6 === '::1' ||
    v6 === '::' ||
    v6.startsWith('fe80:') ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    v6.startsWith('::ffff:127.') ||
    v6.startsWith('::ffff:10.') ||
    v6.startsWith('::ffff:192.168.')
  );
}

/** Strip anything that could carry secret material out of a provider error. */
function sanitizeProviderError(raw: string): string {
  return raw
    .replace(/\b(password|token|secret|authorization|api[_-]?key)\b\S*/gi, '$1=***')
    .replace(/postgres(ql)?:\/\/[^\s]+/gi, 'postgresql://***')
    .replace(/xox[baprs]-[A-Za-z0-9-]+/g, 'xox***')
    .slice(0, 200);
}
