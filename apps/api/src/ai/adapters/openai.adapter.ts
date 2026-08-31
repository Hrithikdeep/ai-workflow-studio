import { Injectable } from '@nestjs/common';

import { OPENAI_PROVIDER } from '../ai-models';
import {
  AiInvalidRequestError,
  AiProviderError,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProviderAdapter,
} from '../ai-provider.types';

const OPENAI_CHAT_COMPLETIONS_URL =
  'https://api.openai.com/v1/chat/completions';

/**
 * Safety ceiling on the response body we will read into memory. A normal
 * chat completion is a few KB of JSON; anything past this is pathological
 * and is treated as an unexpected provider error rather than parsed.
 * Mirrors the capped-read approach in the existing HTTP executor.
 */
const MAX_RESPONSE_BYTES = 1024 * 1024;

/**
 * OpenAI implementation of {@link AiProviderAdapter}.
 *
 * Owns every OpenAI-specific detail: the Chat Completions endpoint, the
 * `Authorization: Bearer` header, the request/response JSON shape, and the
 * HTTP-status → safe-error mapping. Uses native `fetch` only — no SDK.
 *
 * It never logs, never returns, and never puts into a thrown error: the
 * API key, the Authorization header, the request body, or raw provider
 * response content. Only a normalized result or a safe typed error escapes.
 */
@Injectable()
export class OpenAiAdapter implements AiProviderAdapter {
  readonly provider = OPENAI_PROVIDER;

  async complete(
    request: AiCompletionRequest,
    apiKey: string,
  ): Promise<AiCompletionResult> {
    // ---- local validation: no network call when required input is absent
    const key = typeof apiKey === 'string' ? apiKey.trim() : '';
    const model =
      request && typeof request.model === 'string' ? request.model.trim() : '';
    const prompt =
      request && typeof request.prompt === 'string' ? request.prompt : '';
    const system =
      request && typeof request.system === 'string'
        ? request.system.trim()
        : '';

    if (key === '') {
      throw new AiInvalidRequestError(
        'MISSING_API_KEY',
        'An OpenAI API key is required.',
      );
    }
    if (model === '') {
      throw new AiInvalidRequestError(
        'MISSING_MODEL',
        'A model is required.',
      );
    }
    if (prompt.trim() === '') {
      throw new AiInvalidRequestError(
        'EMPTY_PROMPT',
        'A non-empty prompt is required.',
      );
    }

    // ---- build the request body
    const messages: Array<{ role: string; content: string }> = [];
    if (system !== '') {
      messages.push({ role: 'system', content: system });
    }
    messages.push({ role: 'user', content: prompt });

    const body: Record<string, unknown> = { model, messages };
    if (
      typeof request.maxOutputTokens === 'number' &&
      Number.isFinite(request.maxOutputTokens) &&
      request.maxOutputTokens > 0
    ) {
      body.max_tokens = Math.trunc(request.maxOutputTokens);
    }

    // ---- transport
    let res: Response;
    try {
      res = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'AbortError' || name === 'TimeoutError') {
        throw new AiProviderError(
          'TIMEOUT',
          this.provider,
          'OpenAI request timed out.',
        );
      }
      throw new AiProviderError(
        'PROVIDER_ERROR',
        this.provider,
        'OpenAI could not be reached.',
      );
    }

    const rawText = await readCappedText(res);
    const parsed = safeJsonParse(rawText);

    if (!res.ok) {
      throw mapHttpError(res.status, parsed, this.provider);
    }

    return normalizeSuccess(parsed, model, this.provider);
  }
}

// ---------------------------------------------------------------------------
// helpers — none of these log, and none put raw provider text into an error
// ---------------------------------------------------------------------------

async function readCappedText(res: Response): Promise<string> {
  let full: string;
  try {
    full = await res.text();
  } catch {
    return '';
  }
  if (Buffer.byteLength(full, 'utf8') <= MAX_RESPONSE_BYTES) {
    return full;
  }
  return Buffer.from(full, 'utf8')
    .subarray(0, MAX_RESPONSE_BYTES)
    .toString('utf8');
}

function safeJsonParse(text: string): unknown {
  if (text.trim() === '') {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Classify a non-2xx response. The `parsed` body is inspected ONLY to
 * detect a content-policy signal; its text is never surfaced.
 */
function mapHttpError(
  status: number,
  parsed: unknown,
  provider: string,
): AiProviderError {
  const root = asRecord(parsed);
  const errObj = root ? asRecord(root.error) : null;
  const errCode =
    errObj && typeof errObj.code === 'string' ? errObj.code : '';

  if (
    errCode === 'content_filter' ||
    errCode === 'content_policy_violation'
  ) {
    return new AiProviderError(
      'CONTENT_FILTER',
      provider,
      'OpenAI content was blocked by the provider.',
      status,
    );
  }
  if (status === 401 || status === 403) {
    return new AiProviderError(
      'AUTH_FAILED',
      provider,
      'OpenAI authentication failed.',
      status,
    );
  }
  if (status === 429) {
    return new AiProviderError(
      'RATE_LIMITED',
      provider,
      'OpenAI rate limit reached.',
      status,
    );
  }
  if (status === 400) {
    return new AiProviderError(
      'BAD_REQUEST',
      provider,
      'OpenAI rejected the request.',
      status,
    );
  }
  return new AiProviderError(
    'PROVIDER_ERROR',
    provider,
    'OpenAI returned an unexpected error.',
    status,
  );
}

/** Normalize a 2xx body, or throw a safe error if it is unusable. */
function normalizeSuccess(
  parsed: unknown,
  requestedModel: string,
  provider: string,
): AiCompletionResult {
  const malformed = () =>
    new AiProviderError(
      'PROVIDER_ERROR',
      provider,
      'OpenAI returned an unexpected error.',
    );

  const root = asRecord(parsed);
  const choices =
    root && Array.isArray(root.choices) ? (root.choices as unknown[]) : null;
  const choice = choices && choices.length > 0 ? asRecord(choices[0]) : null;
  if (!choice) {
    throw malformed();
  }

  const finishReason =
    typeof choice.finish_reason === 'string' ? choice.finish_reason : null;
  if (finishReason === 'content_filter') {
    throw new AiProviderError(
      'CONTENT_FILTER',
      provider,
      'OpenAI content was blocked by the provider.',
    );
  }

  const message = asRecord(choice.message);
  const content = message ? message.content : undefined;
  if (typeof content !== 'string') {
    throw malformed();
  }

  const usage = root ? asRecord(root.usage) : null;
  const inputTokens =
    usage && typeof usage.prompt_tokens === 'number'
      ? usage.prompt_tokens
      : 0;
  const outputTokens =
    usage && typeof usage.completion_tokens === 'number'
      ? usage.completion_tokens
      : 0;

  const model =
    root && typeof root.model === 'string' && root.model.trim() !== ''
      ? root.model
      : requestedModel;

  return {
    text: content,
    model,
    usage: { inputTokens, outputTokens },
    finishReason,
  };
}
