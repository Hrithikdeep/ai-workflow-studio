// Keep retry backoff instant so tests are fast and deterministic (no real
// waiting). The executor reads this per call.
process.env.AI_EXECUTOR_RETRY_BASE_MS = '0';

import { ExecutionStepStatus } from '@prisma/client';

import { AiNodeExecutor } from './ai.executor';
import type { NodeExecutionContext } from './node-executor';
import {
  AiInvalidRequestError,
  AiProviderError,
  type AiCompletionResult,
} from '../../ai/ai-provider.types';

const FAKE_KEY = 'sk-test-not-real';
/** Sentinel planted in raw errors — must never reach the node result. */
const RAW_MARKER = 'RAW_PROVIDER_DETAIL_SHOULD_NOT_LEAK';

const OK_RESULT: AiCompletionResult = {
  text: 'Hello from the model.',
  model: 'gpt-4.1-mini',
  usage: { inputTokens: 5, outputTokens: 3 },
  finishReason: 'stop',
};

function makeExecutor(overrides?: {
  integration?: unknown;
  secrets?: Record<string, unknown> | null;
  aiComplete?: jest.Mock;
}) {
  const integrations = {
    getForExecution: jest
      .fn()
      .mockResolvedValue(
        overrides && 'integration' in overrides
          ? overrides.integration
          : { id: 'int-1', provider: 'openai', name: 'OpenAI' },
      ),
  };
  const credentials = {
    getDecryptedForIntegration: jest
      .fn()
      .mockResolvedValue(
        overrides && 'secrets' in overrides
          ? overrides.secrets
          : { apiKey: FAKE_KEY },
      ),
  };
  const ai = {
    complete: overrides?.aiComplete ?? jest.fn().mockResolvedValue(OK_RESULT),
  };
  const executor = new AiNodeExecutor(
    integrations as never,
    credentials as never,
    ai as never,
  );
  return { executor, integrations, credentials, ai };
}

const node = { id: 'node-ai-1', label: 'AI Prompt', type: 'AI_PROMPT' };
const ctx = (workspaceId?: string): NodeExecutionContext => ({
  workspaceId,
  workflow: { id: 'wf-1', versionId: 'v-1' },
  execution: { id: 'ex-1', triggerType: 'MANUAL' },
  input: {},
  variables: {},
  previous: {},
});
const goodConfig = {
  integrationId: 'int-1',
  model: 'gpt-4.1-mini',
  prompt: 'Say hi',
};

/** No credential / header / raw provider text anywhere in the result. */
function assertSafe(result: unknown): void {
  const s = JSON.stringify(result);
  expect(s).not.toContain(FAKE_KEY);
  expect(s).not.toContain('sk-test');
  expect(s).not.toContain('Bearer ');
  expect(s.toLowerCase()).not.toContain('authorization');
  expect(s).not.toContain('apiKey');
  expect(s).not.toContain(RAW_MARKER);
}

describe('AiNodeExecutor — success', () => {
  it('completes and returns a normalized, redacted output', async () => {
    const { executor, integrations, credentials, ai } = makeExecutor();

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect(integrations.getForExecution).toHaveBeenCalledWith('ws-1', 'int-1');
    expect(credentials.getDecryptedForIntegration).toHaveBeenCalledWith(
      'ws-1',
      'int-1',
    );
    expect(ai.complete).toHaveBeenCalledTimes(1);

    expect(result.status).toBe(ExecutionStepStatus.SUCCEEDED);
    expect(result.error).toBeNull();
    expect(result.output).toMatchObject({
      nodeId: 'node-ai-1',
      nodeType: 'AI_PROMPT',
      label: 'AI Prompt',
      status: 'SUCCEEDED',
      text: 'Hello from the model.',
      model: 'gpt-4.1-mini',
      usage: { inputTokens: 5, outputTokens: 3 },
      finishReason: 'stop',
      config: { integrationId: 'int-1', model: 'gpt-4.1-mini' },
    });
    assertSafe(result);
  });

  it('passes provider/model/prompt/system and an AbortSignal to AiService', async () => {
    const { executor, ai } = makeExecutor();

    await executor.execute(
      { ...node },
      { ...goodConfig, system: 'Be terse.', maxOutputTokens: 128 },
      ctx('ws-1'),
    );

    const arg = ai.complete.mock.calls[0][0];
    expect(arg.provider).toBe('openai');
    expect(arg.apiKey).toBe(FAKE_KEY);
    expect(arg.model).toBe('gpt-4.1-mini');
    expect(arg.prompt).toBe('Say hi');
    expect(arg.system).toBe('Be terse.');
    expect(arg.maxOutputTokens).toBe(128);
    expect(arg.signal).toBeInstanceOf(AbortSignal);
    expect(arg.signal.aborted).toBe(false);
  });

  it('preserves a non-"stop" finishReason', async () => {
    const { executor } = makeExecutor({
      aiComplete: jest
        .fn()
        .mockResolvedValue({ ...OK_RESULT, finishReason: 'length' }),
    });

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect((result.output as any).finishReason).toBe('length');
  });

  it('exposes text at output.text so {{ previous.output.text }} can resolve', async () => {
    const { executor } = makeExecutor();
    const result = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect(typeof (result.output as any).text).toBe('string');
    expect((result.output as any).text).toBe('Hello from the model.');
  });
});

describe('AiNodeExecutor — prompt / input semantics', () => {
  it('uses prompt over input when both are present', async () => {
    const { executor, ai } = makeExecutor();
    await executor.execute(
      node,
      { integrationId: 'int-1', model: 'gpt-4.1-mini', prompt: 'PROMPT', input: 'INPUT' },
      ctx('ws-1'),
    );
    expect(ai.complete.mock.calls[0][0].prompt).toBe('PROMPT');
  });

  it('falls back to input when prompt is absent', async () => {
    const { executor, ai } = makeExecutor();
    await executor.execute(
      node,
      { integrationId: 'int-1', model: 'gpt-4.1-mini', input: 'INPUT ONLY' },
      ctx('ws-1'),
    );
    expect(ai.complete.mock.calls[0][0].prompt).toBe('INPUT ONLY');
  });

  it('fails locally when both prompt and input are blank — no provider call', async () => {
    const { executor, ai } = makeExecutor();
    const result = await executor.execute(
      node,
      { integrationId: 'int-1', model: 'gpt-4.1-mini', prompt: '   ', input: '' },
      ctx('ws-1'),
    );
    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect((result.output as any).code).toBe('AI_PROMPT_EMPTY');
    expect(ai.complete).not.toHaveBeenCalled();
  });
});

describe('AiNodeExecutor — local validation (no provider call)', () => {
  it('missing integrationId', async () => {
    const { executor, integrations, ai } = makeExecutor();
    const result = await executor.execute(
      node,
      { model: 'gpt-4.1-mini', prompt: 'hi' },
      ctx('ws-1'),
    );
    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect((result.output as any).code).toBe('AI_INTEGRATION_NOT_CONFIGURED');
    expect(integrations.getForExecution).not.toHaveBeenCalled();
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('no workspace context', async () => {
    const { executor, ai } = makeExecutor();
    const result = await executor.execute(node, goodConfig, ctx(undefined));
    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect((result.output as any).code).toBe('AI_NO_WORKSPACE');
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('missing model', async () => {
    const { executor, ai } = makeExecutor();
    const result = await executor.execute(
      node,
      { integrationId: 'int-1', prompt: 'hi' },
      ctx('ws-1'),
    );
    expect((result.output as any).code).toBe('AI_MODEL_MISSING');
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('unsupported model', async () => {
    const { executor, ai } = makeExecutor();
    const result = await executor.execute(
      node,
      { integrationId: 'int-1', model: 'gpt-9-omni-turbo', prompt: 'hi' },
      ctx('ws-1'),
    );
    expect((result.output as any).code).toBe('AI_MODEL_UNSUPPORTED');
    expect(ai.complete).not.toHaveBeenCalled();
  });
});

describe('AiNodeExecutor — integration / credential resolution', () => {
  it('integration not found (or not owned by the workspace)', async () => {
    const { executor, ai } = makeExecutor({ integration: null });
    const result = await executor.execute(node, goodConfig, ctx('ws-A'));
    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect((result.output as any).code).toBe('AI_INTEGRATION_NOT_FOUND');
    // must not disclose that it exists in a different workspace
    expect(result.error).not.toMatch(/other|another|workspace [A-Z0-9]|belongs to/i);
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('integration provider is not openai', async () => {
    const { executor, ai } = makeExecutor({
      integration: { id: 'int-1', provider: 'anthropic', name: 'Claude' },
    });
    const result = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect((result.output as any).code).toBe('AI_PROVIDER_UNSUPPORTED');
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('integration has no stored API key', async () => {
    const { executor, ai } = makeExecutor({ secrets: {} });
    const result = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect((result.output as any).code).toBe('AI_MISSING_CREDENTIAL');
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('credential row missing entirely', async () => {
    const { executor, ai } = makeExecutor({ secrets: null });
    const result = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect((result.output as any).code).toBe('AI_MISSING_CREDENTIAL');
    expect(ai.complete).not.toHaveBeenCalled();
  });
});

describe('AiNodeExecutor — provider error mapping (safe)', () => {
  it.each([
    ['AUTH_FAILED', 'AI_AUTH_FAILED'],
    ['RATE_LIMITED', 'AI_RATE_LIMITED'],
    ['TIMEOUT', 'AI_TIMEOUT'],
    ['CONTENT_FILTER', 'AI_CONTENT_FILTER'],
    ['BAD_REQUEST', 'AI_BAD_REQUEST'],
    ['PROVIDER_ERROR', 'AI_PROVIDER_ERROR'],
  ])('maps AiProviderError %s to %s', async (providerCode, nodeCode) => {
    const { executor } = makeExecutor({
      aiComplete: jest
        .fn()
        .mockRejectedValue(
          new AiProviderError(providerCode as any, 'openai', 'safe msg', 500),
        ),
    });

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect((result.output as any).code).toBe(nodeCode);
    expect(typeof result.error).toBe('string');
    assertSafe(result);
  });

  it('maps a local AiInvalidRequestError from the AI layer defensively', async () => {
    const { executor } = makeExecutor({
      aiComplete: jest
        .fn()
        .mockRejectedValue(
          new AiInvalidRequestError('EMPTY_PROMPT', 'A non-empty prompt is required.'),
        ),
    });
    const result = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect((result.output as any).code).toBe('AI_PROMPT_EMPTY');
  });

  it('never leaks a key or raw provider text from an unexpected thrown error', async () => {
    const { executor } = makeExecutor({
      aiComplete: jest
        .fn()
        .mockRejectedValue(
          new Error(`boom ${FAKE_KEY} :: ${RAW_MARKER} :: Authorization: Bearer x`),
        ),
    });

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect((result.output as any).code).toBe('AI_PROVIDER_ERROR');
    expect(result.error).toBe('The AI request could not be completed.');
    assertSafe(result);
  });
});

describe('AiNodeExecutor — output safety', () => {
  it('success output carries no apiKey / Authorization / raw provider payload', async () => {
    const { executor } = makeExecutor({
      aiComplete: jest.fn().mockResolvedValue({
        ...OK_RESULT,
        // even if the AI layer somehow returned extra junk, the executor
        // only copies the four normalized fields:
        text: 'clean answer',
      }),
    });

    const result = await executor.execute(
      { ...node },
      { ...goodConfig, prompt: 'a very secret prompt' },
      ctx('ws-1'),
    );

    const keys = Object.keys(result.output).sort();
    expect(keys).toEqual(
      [
        'attempts',
        'config',
        'finishReason',
        'label',
        'model',
        'nodeId',
        'nodeType',
        'status',
        'text',
        'usage',
      ].sort(),
    );
    expect(Object.keys((result.output as any).config).sort()).toEqual([
      'integrationId',
      'model',
    ]);
    assertSafe(result);
  });
});

/* ========================================================================== */
/* STEP 8 — retry                                                             */
/* ========================================================================== */

const providerErr = (code: string, status?: number) =>
  new AiProviderError(code as any, 'openai', 'safe message', status);

describe('AiNodeExecutor — retry (transient failures)', () => {
  it('rate limit → retry → success (2 attempts)', async () => {
    const aiComplete = jest
      .fn()
      .mockRejectedValueOnce(providerErr('RATE_LIMITED', 429))
      .mockResolvedValueOnce(OK_RESULT);
    const { executor } = makeExecutor({ aiComplete });

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect(aiComplete).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(ExecutionStepStatus.SUCCEEDED);
    expect((result.output as any).text).toBe('Hello from the model.');
    expect((result.output as any).attempts).toBe(2);
    assertSafe(result);
  });

  it('transient 5xx (PROVIDER_ERROR) → retry → success (2 attempts)', async () => {
    const aiComplete = jest
      .fn()
      .mockRejectedValueOnce(providerErr('PROVIDER_ERROR', 503))
      .mockResolvedValueOnce(OK_RESULT);
    const { executor } = makeExecutor({ aiComplete });

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect(aiComplete).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(ExecutionStepStatus.SUCCEEDED);
    expect((result.output as any).attempts).toBe(2);
  });

  it('network-unreachable PROVIDER_ERROR (no status) → retried → success', async () => {
    const aiComplete = jest
      .fn()
      .mockRejectedValueOnce(providerErr('PROVIDER_ERROR')) // no status
      .mockResolvedValueOnce(OK_RESULT);
    const { executor } = makeExecutor({ aiComplete });

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect(aiComplete).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(ExecutionStepStatus.SUCCEEDED);
  });

  it('rate limit → retry → retry → final failure (3 attempts, AI_RATE_LIMITED)', async () => {
    const aiComplete = jest
      .fn()
      .mockRejectedValue(providerErr('RATE_LIMITED', 429));
    const { executor } = makeExecutor({ aiComplete });

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect(aiComplete).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect((result.output as any).code).toBe('AI_RATE_LIMITED');
    expect((result.output as any).attempts).toBe(3);
    expect(result.error).toBe(
      'The AI provider rate limited the request. Try again shortly.',
    );
    assertSafe(result);
  });

  it('exhausted 5xx retries → AI_PROVIDER_ERROR (3 attempts), never a success', async () => {
    const aiComplete = jest
      .fn()
      .mockRejectedValue(providerErr('PROVIDER_ERROR', 502));
    const { executor } = makeExecutor({ aiComplete });

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect(aiComplete).toHaveBeenCalledTimes(3);
    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect((result.output as any).code).toBe('AI_PROVIDER_ERROR');
    expect((result.output as any).attempts).toBe(3);
  });

  it.each([
    ['AUTH_FAILED', 'AI_AUTH_FAILED'],
    ['BAD_REQUEST', 'AI_BAD_REQUEST'],
    ['CONTENT_FILTER', 'AI_CONTENT_FILTER'],
  ])(
    'non-retryable %s → exactly one attempt → %s',
    async (providerCode, nodeCode) => {
      const aiComplete = jest.fn().mockRejectedValue(providerErr(providerCode));
      const { executor } = makeExecutor({ aiComplete });

      const result = await executor.execute(node, goodConfig, ctx('ws-1'));

      expect(aiComplete).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(ExecutionStepStatus.FAILED);
      expect((result.output as any).code).toBe(nodeCode);
      expect((result.output as any).attempts).toBe(1);
    },
  );

  it('unknown (non-AiProviderError) throwable → exactly one attempt', async () => {
    const aiComplete = jest.fn().mockRejectedValue(new Error('boom'));
    const { executor } = makeExecutor({ aiComplete });

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect(aiComplete).toHaveBeenCalledTimes(1);
    expect((result.output as any).code).toBe('AI_PROVIDER_ERROR');
    expect((result.output as any).attempts).toBe(1);
  });

  it('unsupported model → no provider call (attempts 0)', async () => {
    const { executor, ai } = makeExecutor();
    const result = await executor.execute(
      node,
      { integrationId: 'int-1', model: 'gpt-9-omni-turbo', prompt: 'hi' },
      ctx('ws-1'),
    );
    expect(ai.complete).not.toHaveBeenCalled();
    expect((result.output as any).code).toBe('AI_MODEL_UNSUPPORTED');
    expect((result.output as any).attempts).toBe(0);
  });

  it('missing credential → no provider call (attempts 0)', async () => {
    const { executor, ai } = makeExecutor({ secrets: {} });
    const result = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect(ai.complete).not.toHaveBeenCalled();
    expect((result.output as any).code).toBe('AI_MISSING_CREDENTIAL');
    expect((result.output as any).attempts).toBe(0);
  });
});

/* ========================================================================== */
/* STEP 8 — timeout                                                           */
/* ========================================================================== */

describe('AiNodeExecutor — timeout', () => {
  it('TIMEOUT maps to AI_TIMEOUT and is NOT retried (exactly one attempt)', async () => {
    const aiComplete = jest
      .fn()
      .mockRejectedValue(
        new AiProviderError('TIMEOUT', 'openai', 'OpenAI request timed out.'),
      );
    const { executor } = makeExecutor({ aiComplete });

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect(aiComplete).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect((result.output as any).code).toBe('AI_TIMEOUT');
    expect(result.error).toBe('The AI request timed out.');
    expect((result.output as any).attempts).toBe(1);
    assertSafe(result);
  });

  it('timeout error never leaks a raw provider message / key', async () => {
    const aiComplete = jest
      .fn()
      .mockRejectedValue(
        new AiProviderError(
          'TIMEOUT',
          'openai',
          `raw ${RAW_MARKER} ${FAKE_KEY} Authorization: Bearer x`,
        ),
      );
    const { executor } = makeExecutor({ aiComplete });

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect(result.error).toBe('The AI request timed out.');
    assertSafe(result);
  });

  it('each attempt gets its own fresh AbortSignal (per-attempt timeout)', async () => {
    const aiComplete = jest
      .fn()
      .mockRejectedValueOnce(providerErr('RATE_LIMITED', 429))
      .mockResolvedValueOnce(OK_RESULT);
    const { executor } = makeExecutor({ aiComplete });

    await executor.execute(node, goodConfig, ctx('ws-1'));

    const s0 = aiComplete.mock.calls[0][0].signal;
    const s1 = aiComplete.mock.calls[1][0].signal;
    expect(s0).toBeInstanceOf(AbortSignal);
    expect(s1).toBeInstanceOf(AbortSignal);
    expect(s0).not.toBe(s1); // fresh signal per attempt
  });

  it('respects the configured AI_EXECUTOR_TIMEOUT_MS (signal actually fires)', async () => {
    const prev = process.env.AI_EXECUTOR_TIMEOUT_MS;
    process.env.AI_EXECUTOR_TIMEOUT_MS = '30';
    try {
      // The adapter honours the signal: reject with TIMEOUT when it aborts.
      const aiComplete = jest.fn().mockImplementation(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () =>
              reject(
                new AiProviderError(
                  'TIMEOUT',
                  'openai',
                  'OpenAI request timed out.',
                ),
              ),
            );
          }),
      );
      const { executor } = makeExecutor({ aiComplete });

      const result = await executor.execute(node, goodConfig, ctx('ws-1'));

      expect(aiComplete).toHaveBeenCalledTimes(1); // timeout not retried
      expect(result.status).toBe(ExecutionStepStatus.FAILED);
      expect((result.output as any).code).toBe('AI_TIMEOUT');
    } finally {
      if (prev === undefined) delete process.env.AI_EXECUTOR_TIMEOUT_MS;
      else process.env.AI_EXECUTOR_TIMEOUT_MS = prev;
    }
  });
});

/* ========================================================================== */
/* STEP 8 — usage                                                             */
/* ========================================================================== */

describe('AiNodeExecutor — usage', () => {
  it('preserves provider inputTokens / outputTokens exactly', async () => {
    const aiComplete = jest.fn().mockResolvedValue({
      ...OK_RESULT,
      usage: { inputTokens: 137, outputTokens: 42 },
    });
    const { executor } = makeExecutor({ aiComplete });

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect((result.output as any).usage).toEqual({
      inputTokens: 137,
      outputTokens: 42,
    });
  });

  it('does not invent numbers when the provider omitted usage (established 0 contract)', async () => {
    const aiComplete = jest.fn().mockResolvedValue({
      ...OK_RESULT,
      // The adapter's documented default when the provider omits `usage`.
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    const { executor } = makeExecutor({ aiComplete });

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect((result.output as any).usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it('usage survives a retry-then-success sequence', async () => {
    const aiComplete = jest
      .fn()
      .mockRejectedValueOnce(providerErr('RATE_LIMITED', 429))
      .mockResolvedValueOnce({
        ...OK_RESULT,
        usage: { inputTokens: 11, outputTokens: 7 },
      });
    const { executor } = makeExecutor({ aiComplete });

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect(result.status).toBe(ExecutionStepStatus.SUCCEEDED);
    expect((result.output as any).usage).toEqual({
      inputTokens: 11,
      outputTokens: 7,
    });
    expect((result.output as any).attempts).toBe(2);
  });
});

/* ========================================================================== */
/* STEP 8 — security of retry / error paths                                   */
/* ========================================================================== */

describe('AiNodeExecutor — retry/error security', () => {
  it('exhausted-retry failure contains no key / Authorization / raw body', async () => {
    const aiComplete = jest.fn().mockRejectedValue(
      new AiProviderError(
        'RATE_LIMITED',
        'openai',
        `rate limited ${RAW_MARKER} key=${FAKE_KEY} Authorization: Bearer abc`,
        429,
      ),
    );
    const { executor } = makeExecutor({ aiComplete });

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect(aiComplete).toHaveBeenCalledTimes(3);
    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect(result.error).toBe(
      'The AI provider rate limited the request. Try again shortly.',
    );
    assertSafe(result);
    // output carries only safe fields
    expect(Object.keys(result.output).sort()).toEqual(
      ['attempts', 'code', 'config', 'label', 'nodeId', 'nodeType', 'status'].sort(),
    );
  });
});
