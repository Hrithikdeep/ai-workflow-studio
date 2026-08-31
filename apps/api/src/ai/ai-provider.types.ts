/**
 * Provider-neutral contract for the AI completion layer.
 *
 * Nothing in this file may reference workflows, nodes, executions, Prisma,
 * Integration objects, HTTP details, or a specific provider's response
 * schema. It is the shared vocabulary between {@link AiService} and any
 * concrete provider adapter.
 */

/** A single, normalized chat-completion request. */
export interface AiCompletionRequest {
  /** Provider model id (e.g. an OpenAI model). Validated by the adapter. */
  model: string;
  /** The user prompt. Must be non-empty. */
  prompt: string;
  /** Optional system instruction. Omitted from the provider call when absent. */
  system?: string;
  /** Caller-owned cancellation/timeout signal, forwarded to the transport. */
  signal?: AbortSignal;
  /** Optional cap on generated tokens. */
  maxOutputTokens?: number;
}

/** Token accounting, always present (0 when the provider omits it). */
export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

/** The normalized result every adapter must return on success. */
export interface AiCompletionResult {
  text: string;
  model: string;
  usage: AiUsage;
  finishReason: string | null;
}

/**
 * Safe, machine-readable failure categories. A caller can branch on `code`
 * without ever seeing raw provider output.
 */
export type AiProviderErrorCode =
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'CONTENT_FILTER'
  | 'BAD_REQUEST'
  | 'PROVIDER_ERROR';

/**
 * Raised when a provider call fails. Carries only a safe category, the
 * provider slug, and (optionally) the HTTP status used to classify it.
 *
 * It MUST NEVER carry the API key, the Authorization header, the request
 * body, or raw provider response content. `message` is always one of a
 * small set of fixed, provider-neutral strings.
 */
export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  readonly provider: string;
  readonly status?: number;

  constructor(
    code: AiProviderErrorCode,
    provider: string,
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = 'AiProviderError';
    this.code = code;
    this.provider = provider;
    if (typeof status === 'number') {
      this.status = status;
    }
  }
}

/** Codes for locally-detected invalid input (no provider call was made). */
export type AiInvalidRequestCode =
  | 'MISSING_API_KEY'
  | 'MISSING_MODEL'
  | 'EMPTY_PROMPT'
  | 'UNSUPPORTED_PROVIDER';

/**
 * Raised for invalid *local* input before any network request. Distinct
 * from {@link AiProviderError} so a provider API failure is never confused
 * with a caller mistake. Carries only a fixed message and a code — never a
 * field value, and never a credential.
 */
export class AiInvalidRequestError extends Error {
  readonly code: AiInvalidRequestCode;

  constructor(code: AiInvalidRequestCode, message: string) {
    super(message);
    this.name = 'AiInvalidRequestError';
    this.code = code;
  }
}

/**
 * A concrete provider implementation. The adapter owns all transport and
 * response-schema details for its provider; the service only resolves and
 * delegates to it.
 */
export interface AiProviderAdapter {
  /** Provider slug this adapter handles (e.g. `"openai"`). */
  readonly provider: string;

  /**
   * Perform one chat completion. Resolves to a normalized
   * {@link AiCompletionResult}; rejects with {@link AiInvalidRequestError}
   * (bad local input, no call made) or {@link AiProviderError} (call failed
   * or returned something unusable).
   */
  complete(
    request: AiCompletionRequest,
    apiKey: string,
  ): Promise<AiCompletionResult>;
}
