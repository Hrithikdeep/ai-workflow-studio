import { Injectable } from '@nestjs/common';

import { OPENAI_PROVIDER } from './ai-models';
import { OpenAiAdapter } from './adapters/openai.adapter';
import {
  AiInvalidRequestError,
  type AiCompletionResult,
  type AiProviderAdapter,
} from './ai-provider.types';

/** Parameters for a provider-agnostic completion call. */
export interface AiCompleteParams {
  /** Provider slug — must have a registered adapter (currently only `openai`). */
  provider: string;
  /** Plaintext API key, supplied by the trusted caller (never fetched here). */
  apiKey: string;
  model: string;
  prompt: string;
  system?: string;
  signal?: AbortSignal;
  maxOutputTokens?: number;
}

/**
 * Provider-agnostic entry point for AI chat completions.
 *
 * Responsibilities are intentionally narrow:
 *   1. resolve the adapter for the requested provider
 *   2. delegate the call
 *   3. surface the adapter's normalized result / safe typed errors unchanged
 *
 * It knows nothing about OpenAI's endpoint, headers, or response schema —
 * those live entirely in {@link OpenAiAdapter}. It also knows nothing about
 * workflows, nodes, executions, Prisma, or credential storage; the API key
 * arrives as a parameter from the trusted caller.
 */
@Injectable()
export class AiService {
  private readonly adapters: Map<string, AiProviderAdapter>;

  constructor(private readonly openAiAdapter: OpenAiAdapter) {
    // Small provider → completion-adapter registry. This is NOT the product's
    // Integration provider registry (that answers "which integrations exist");
    // this answers "which completion implementation handles this provider".
    this.adapters = new Map<string, AiProviderAdapter>([
      [OPENAI_PROVIDER, openAiAdapter],
    ]);
  }

  /** Providers that currently have a completion adapter registered. */
  get supportedProviders(): string[] {
    return [...this.adapters.keys()];
  }

  async complete(params: AiCompleteParams): Promise<AiCompletionResult> {
    const provider =
      params && typeof params.provider === 'string'
        ? params.provider.trim()
        : '';
    const adapter = provider ? this.adapters.get(provider) : undefined;
    if (!adapter) {
      throw new AiInvalidRequestError(
        'UNSUPPORTED_PROVIDER',
        `No AI completion adapter is registered for provider "${
          provider || '(none)'
        }".`,
      );
    }

    // The adapter performs the remaining local-input validation (key / model /
    // prompt) before it makes any network request.
    return adapter.complete(
      {
        model: params.model,
        prompt: params.prompt,
        system: params.system,
        signal: params.signal,
        maxOutputTokens: params.maxOutputTokens,
      },
      params.apiKey,
    );
  }
}
