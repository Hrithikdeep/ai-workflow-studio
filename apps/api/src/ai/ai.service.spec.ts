import { Test } from '@nestjs/testing';

import { AiModule } from './ai.module';
import { AiService } from './ai.service';
import { OpenAiAdapter } from './adapters/openai.adapter';
import {
  AiInvalidRequestError,
  AiProviderError,
  type AiCompletionResult,
  type AiProviderAdapter,
} from './ai-provider.types';

const FAKE_KEY = 'sk-test-not-real';

const NORMALIZED: AiCompletionResult = {
  text: 'hello',
  model: 'gpt-4.1-mini',
  usage: { inputTokens: 3, outputTokens: 4 },
  finishReason: 'stop',
};

/** Stub adapter so delegation can be asserted without any transport. */
function stubAdapter(
  impl: jest.Mock = jest.fn().mockResolvedValue(NORMALIZED),
): { adapter: AiProviderAdapter; complete: jest.Mock } {
  const complete = impl;
  return { adapter: { provider: 'openai', complete } as AiProviderAdapter, complete };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AiService', () => {
  it('reports "openai" as a supported provider', () => {
    const service = new AiService(new OpenAiAdapter());
    expect(service.supportedProviders).toContain('openai');
  });

  it('resolves the openai adapter and delegates with the mapped request + api key', async () => {
    const { adapter, complete } = stubAdapter();
    const service = new AiService(adapter as unknown as OpenAiAdapter);

    const result = await service.complete({
      provider: 'openai',
      apiKey: FAKE_KEY,
      model: 'gpt-4.1-mini',
      prompt: 'Hello',
      system: 'be nice',
      maxOutputTokens: 128,
    });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith(
      {
        model: 'gpt-4.1-mini',
        prompt: 'Hello',
        system: 'be nice',
        signal: undefined,
        maxOutputTokens: 128,
      },
      FAKE_KEY,
    );
    expect(result).toBe(NORMALIZED);
  });

  it('propagates a safe AiProviderError from the adapter unchanged', async () => {
    const boom = new AiProviderError('RATE_LIMITED', 'openai', 'OpenAI rate limit reached.', 429);
    const { adapter } = stubAdapter(jest.fn().mockRejectedValue(boom));
    const service = new AiService(adapter as unknown as OpenAiAdapter);

    const err: any = await service
      .complete({ provider: 'openai', apiKey: FAKE_KEY, model: 'gpt-4.1', prompt: 'Q' })
      .catch((e) => e);

    expect(err).toBe(boom);
    expect(err.code).toBe('RATE_LIMITED');
    expect(JSON.stringify(err)).not.toContain(FAKE_KEY);
  });

  it('rejects an unsupported provider without calling any adapter', async () => {
    const { adapter, complete } = stubAdapter();
    const service = new AiService(adapter as unknown as OpenAiAdapter);

    const err: any = await service
      .complete({
        provider: 'anthropic',
        apiKey: FAKE_KEY,
        model: 'claude-3',
        prompt: 'Q',
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(AiInvalidRequestError);
    expect(err.code).toBe('UNSUPPORTED_PROVIDER');
    expect(complete).not.toHaveBeenCalled();
  });

  it('with the real adapter, resolves openai and normalizes a mocked HTTP response', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: 'm-resolved',
          choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 2 },
        }),
    } as unknown as Response);

    const service = new AiService(new OpenAiAdapter());
    const result = await service.complete({
      provider: 'openai',
      apiKey: FAKE_KEY,
      model: 'gpt-4.1-mini',
      prompt: 'Hello',
    });

    expect(result).toEqual({
      text: 'hi',
      model: 'm-resolved',
      usage: { inputTokens: 1, outputTokens: 2 },
      finishReason: 'stop',
    });
  });
});

describe('AiModule', () => {
  it('provides AiService and wires the OpenAiAdapter', async () => {
    const ref = await Test.createTestingModule({ imports: [AiModule] }).compile();
    expect(ref.get(AiService)).toBeInstanceOf(AiService);
    expect(ref.get(OpenAiAdapter)).toBeInstanceOf(OpenAiAdapter);
  });
});
