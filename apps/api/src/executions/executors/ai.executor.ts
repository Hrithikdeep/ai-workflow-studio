import { Injectable } from '@nestjs/common';
import { ExecutionStepStatus } from '@prisma/client';

import { IntegrationsService } from '../../integrations/integrations.service';
import { IntegrationCredentialsService } from '../../integrations/integration-credentials.service';
import { AiService } from '../../ai/ai.service';
import { OPENAI_PROVIDER, isSupportedOpenAiModel } from '../../ai/ai-models';
import {
  AiInvalidRequestError,
  AiProviderError,
  type AiCompletionResult,
} from '../../ai/ai-provider.types';
import type {
  ExecutorNode,
  NodeExecutionContext,
  NodeExecutionResult,
} from './node-executor';

/** Per-attempt timeout for a single AI completion. */
const DEFAULT_TIMEOUT_MS = 30_000;
/** Retries after the initial attempt → up to 3 provider attempts total. */
const DEFAULT_MAX_RETRIES = 2;
/** Base backoff: retry #1 ~250ms, retry #2 ~500ms (± jitter). */
const DEFAULT_RETRY_BASE_MS = 250;

function timeoutMs(): number {
  const raw = Number(process.env.AI_EXECUTOR_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : DEFAULT_TIMEOUT_MS;
}

/** Retries after the initial attempt. Clamped to [0, 5]. */
function maxRetries(): number {
  const raw = Number(process.env.AI_EXECUTOR_MAX_RETRIES);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_MAX_RETRIES;
  return Math.min(5, Math.trunc(raw));
}

/** Exponential backoff base in ms. Clamped to [0, 5000]. */
function retryBaseMs(): number {
  const raw = Number(process.env.AI_EXECUTOR_RETRY_BASE_MS);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_RETRY_BASE_MS;
  return Math.min(5_000, Math.trunc(raw));
}

/**
 * Delay before retry `retryIndex` (0 = before the 1st retry). Exponential
 * with equal jitter: half fixed, half random, so the result lands in
 * `[base·2^i / 2, base·2^i]`.
 */
function backoffMs(retryIndex: number): number {
  const base = retryBaseMs() * 2 ** retryIndex;
  return Math.round(base / 2 + Math.random() * (base / 2));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Only *transient* provider failures are retried:
 *  - `RATE_LIMITED`  (HTTP 429)
 *  - `PROVIDER_ERROR` (HTTP 5xx, network-unreachable, or an unusable body)
 *
 * NOT retried: `AUTH_FAILED`, `BAD_REQUEST`, `CONTENT_FILTER`, `TIMEOUT`,
 * every `AiInvalidRequestError` (missing credential / model / prompt /
 * unsupported provider), and any non-`AiProviderError` (unknown) throwable.
 */
function isRetryableProviderError(error: unknown): boolean {
  return (
    error instanceof AiProviderError &&
    (error.code === 'RATE_LIMITED' || error.code === 'PROVIDER_ERROR')
  );
}

/**
 * Executes an `AI_PROMPT` workflow node.
 *
 * All `{{ }}` templates in the node config were already resolved by
 * `resolveNodeConfig` before this runs — this executor never interpolates.
 *
 * It resolves the workspace's OpenAI integration (the Integration row is the
 * source of truth for provider identity), decrypts the stored API key, and
 * performs one completion through the isolated {@link AiService}. The
 * decrypted key is used only for that call: it never appears in the node
 * result, the execution record, thrown errors, or logs. No prompt or
 * response text is logged.
 */
@Injectable()
export class AiNodeExecutor {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly credentials: IntegrationCredentialsService,
    private readonly ai: AiService,
  ) {}

  async execute(
    node: ExecutorNode,
    resolvedConfig: Record<string, unknown>,
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> {
    const integrationId = str(resolvedConfig.integrationId);
    const model = str(resolvedConfig.model);
    const system = str(resolvedConfig.system);
    const maxOutputTokens = toPositiveInt(resolvedConfig.maxOutputTokens);
    // `prompt` wins; fall back to the resolved `input`. Neither is trimmed
    // before sending (leading/trailing whitespace may be intentional); only
    // the emptiness check is trim-based.
    const prompt = pickPrompt(resolvedConfig);

    // Echoed into the execution log. Contains no secret, no prompt/response.
    const safeConfig: Record<string, unknown> = { integrationId, model };

    // `attempts` = number of provider calls made (0 for local validation
    // failures that never reach the provider). Safe integer — observability
    // only; never carries provider data.
    const fail = (
      error: string,
      code: string,
      attempts = 0,
    ): NodeExecutionResult => ({
      status: ExecutionStepStatus.FAILED,
      output: {
        nodeId: node.id,
        nodeType: 'AI_PROMPT',
        label: node.label,
        config: safeConfig,
        code,
        attempts,
        status: 'FAILED',
      },
      error,
      branch: null,
    });

    const succeed = (
      r: AiCompletionResult,
      attempts: number,
    ): NodeExecutionResult => ({
      status: ExecutionStepStatus.SUCCEEDED,
      output: {
        nodeId: node.id,
        nodeType: 'AI_PROMPT',
        label: node.label,
        config: safeConfig,
        text: r.text,
        model: r.model,
        usage: {
          inputTokens: r.usage.inputTokens,
          outputTokens: r.usage.outputTokens,
        },
        finishReason: r.finishReason,
        attempts,
        status: 'SUCCEEDED',
      },
      error: null,
      branch: null,
    });

    // ---- local validation: no provider call when required input is absent ---
    if (!integrationId) {
      return fail(
        'An AI integration is not selected on this node.',
        'AI_INTEGRATION_NOT_CONFIGURED',
      );
    }
    if (!context.workspaceId) {
      return fail(
        'AI is not available in this workspace.',
        'AI_NO_WORKSPACE',
      );
    }
    if (!model) {
      return fail('A model is required.', 'AI_MODEL_MISSING');
    }
    if (!isSupportedOpenAiModel(model)) {
      return fail(
        `The model "${model}" is not supported.`,
        'AI_MODEL_UNSUPPORTED',
      );
    }
    if (prompt.trim() === '') {
      return fail('A non-empty prompt is required.', 'AI_PROMPT_EMPTY');
    }

    // ---- workspace-scoped integration — source of truth for the provider ---
    const integration = await this.integrations.getForExecution(
      context.workspaceId,
      integrationId,
    );
    if (!integration) {
      // Do not disclose whether it exists in another workspace.
      return fail(
        'The AI integration is not available in this workspace.',
        'AI_INTEGRATION_NOT_FOUND',
      );
    }
    if (integration.provider !== OPENAI_PROVIDER) {
      return fail(
        'This AI integration provider is not supported.',
        'AI_PROVIDER_UNSUPPORTED',
      );
    }

    // ---- decrypted credential — held only in memory for the call ----------
    const secrets = await this.credentials.getDecryptedForIntegration(
      context.workspaceId,
      integrationId,
    );
    const apiKey = firstString(secrets?.apiKey);
    if (!apiKey) {
      return fail(
        'The AI integration has no stored API key.',
        'AI_MISSING_CREDENTIAL',
      );
    }

    // ---- provider call via the isolated AI layer, with bounded retry -----
    // Only transient failures (rate limit / 5xx / unreachable) are retried.
    // Every attempt gets its own fresh `AbortSignal.timeout(...)`, so a
    // retry never bypasses the per-attempt timeout. A timeout is NOT retried.
    //
    //   per-attempt timeout : AI_EXECUTOR_TIMEOUT_MS      (default 30000ms)
    //   retry count         : AI_EXECUTOR_MAX_RETRIES     (default 2)
    //   attempts total      : retries + 1                 (default max 3)
    //   worst-case provider time ≈ attempts × timeout + Σ backoff
    const maxAttempts = maxRetries() + 1;
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        const result = await this.ai.complete({
          provider: OPENAI_PROVIDER,
          apiKey,
          model,
          prompt,
          system: system !== '' ? system : undefined,
          signal: AbortSignal.timeout(timeoutMs()),
          maxOutputTokens,
        });
        return succeed(result, attempt);
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts && isRetryableProviderError(error)) {
          await sleep(backoffMs(attempt - 1));
          continue;
        }
        break;
      }
    }

    // Retries exhausted (or a non-retryable failure) — return the final,
    // safe, normalized error. Never a success, never a swallowed error.
    const { code, message } = classifyError(lastError);
    return fail(message, code, attempt);
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return undefined;
}

function toPositiveInt(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}

/** `prompt` (raw) if non-blank, otherwise the resolved `input` (raw). */
function pickPrompt(config: Record<string, unknown>): string {
  const asStr = (v: unknown): string =>
    typeof v === 'string' ? v : v == null ? '' : String(v);
  const prompt = asStr(config.prompt);
  if (prompt.trim() !== '') return prompt;
  return asStr(config.input);
}

/**
 * Map a typed error from the AI layer to a safe `{ code, message }`. Never
 * surfaces the API key, an Authorization header, a raw provider body, or a
 * stack trace — only fixed, user-facing strings.
 */
function classifyError(error: unknown): { code: string; message: string } {
  if (error instanceof AiProviderError) {
    switch (error.code) {
      case 'AUTH_FAILED':
        return {
          code: 'AI_AUTH_FAILED',
          message: 'The AI provider rejected the API key.',
        };
      case 'RATE_LIMITED':
        return {
          code: 'AI_RATE_LIMITED',
          message:
            'The AI provider rate limited the request. Try again shortly.',
        };
      case 'TIMEOUT':
        return { code: 'AI_TIMEOUT', message: 'The AI request timed out.' };
      case 'CONTENT_FILTER':
        return {
          code: 'AI_CONTENT_FILTER',
          message: 'The AI provider blocked the content.',
        };
      case 'BAD_REQUEST':
        return {
          code: 'AI_BAD_REQUEST',
          message: 'The AI provider rejected the request.',
        };
      default:
        return {
          code: 'AI_PROVIDER_ERROR',
          message: 'The AI provider returned an unexpected error.',
        };
    }
  }
  if (error instanceof AiInvalidRequestError) {
    switch (error.code) {
      case 'MISSING_API_KEY':
        return {
          code: 'AI_MISSING_CREDENTIAL',
          message: 'The AI integration has no stored API key.',
        };
      case 'MISSING_MODEL':
        return { code: 'AI_MODEL_MISSING', message: 'A model is required.' };
      case 'EMPTY_PROMPT':
        return {
          code: 'AI_PROMPT_EMPTY',
          message: 'A non-empty prompt is required.',
        };
      case 'UNSUPPORTED_PROVIDER':
        return {
          code: 'AI_PROVIDER_UNSUPPORTED',
          message: 'This AI provider is not supported.',
        };
      default:
        return {
          code: 'AI_PROVIDER_ERROR',
          message: 'The AI request could not be completed.',
        };
    }
  }
  // Unknown/unexpected — never echo the raw error.
  return {
    code: 'AI_PROVIDER_ERROR',
    message: 'The AI request could not be completed.',
  };
}
