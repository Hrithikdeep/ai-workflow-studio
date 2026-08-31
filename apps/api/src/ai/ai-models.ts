/**
 * Single source of truth for the OpenAI models this project intentionally
 * supports.
 *
 * The adapter still forwards whatever model string it is handed at runtime
 * (so callers are not blocked by this list), but this constant is the
 * authoritative set that the later node/config step (Step 4/5) must build
 * its model selector from — so there is exactly one place to change.
 *
 * It is deliberately minimal. Final model selection for the AI node is a
 * decision for the node/config step; treat this list as provisional and
 * aligned with the model ids already referenced by the (untouched) editor
 * UI.
 */

export const OPENAI_PROVIDER = 'openai' as const;
export type AiProviderSlug = typeof OPENAI_PROVIDER;

export const OPENAI_MODELS = ['gpt-4.1-mini', 'gpt-4.1'] as const;
export type OpenAiModel = (typeof OPENAI_MODELS)[number];

/** Default when a caller does not pick one (used by later steps, not here). */
export const DEFAULT_OPENAI_MODEL: OpenAiModel = 'gpt-4.1-mini';

export function isSupportedOpenAiModel(value: unknown): value is OpenAiModel {
  return (
    typeof value === 'string' &&
    (OPENAI_MODELS as readonly string[]).includes(value)
  );
}
