/**
 * Frontend mirror of the backend OpenAI model allow-list.
 *
 * ── SOURCE OF TRUTH ──────────────────────────────────────────────────────
 * apps/api/src/ai/ai-models.ts  →  `OPENAI_MODELS`, `DEFAULT_OPENAI_MODEL`
 *
 * The web app is a separate package and cannot import backend source, so
 * this short list is mirrored by hand. It MUST stay aligned with the backend
 * constants — the `AiNodeExecutor` rejects any model not in the backend list
 * (`AI_MODEL_UNSUPPORTED`). Keep this in sync whenever the backend changes.
 *
 * OpenAI only for now — no Anthropic / Gemini models here.
 */

export const OPENAI_MODELS = ['gpt-4.1-mini', 'gpt-4.1'] as const;

export type OpenAiModel = (typeof OPENAI_MODELS)[number];

/** Matches the backend `DEFAULT_OPENAI_MODEL`. */
export const DEFAULT_OPENAI_MODEL: OpenAiModel = 'gpt-4.1-mini';

/** Display labels for the model dropdown (kept identical to the prior UI). */
export const OPENAI_MODEL_LABELS: Record<OpenAiModel, string> = {
  'gpt-4.1-mini': 'GPT-4.1 Mini',
  'gpt-4.1': 'GPT-4.1',
};

export function isSupportedOpenAiModel(value: unknown): value is OpenAiModel {
  return (
    typeof value === 'string' &&
    (OPENAI_MODELS as readonly string[]).includes(value)
  );
}

/**
 * The safe AI_PROMPT node config persisted in the workflow graph.
 * It references an integration by id — it never carries a credential.
 */
export interface AiPromptNodeConfig {
  integrationId?: string;
  model?: string;
  input?: string;
  prompt?: string;
}
