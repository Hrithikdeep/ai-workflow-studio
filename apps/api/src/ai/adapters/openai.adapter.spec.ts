import { OpenAiAdapter } from './openai.adapter';
import {
  AiInvalidRequestError,
  AiProviderError,
} from '../ai-provider.types';

/**
 * Offline unit tests for the OpenAI adapter. `fetch` is always mocked; the
 * key is a throwaway literal and must never surface in a thrown error or a
 * log line.
 */

const FAKE_KEY = 'sk-test-not-real';
/** Sentinel planted in mocked provider bodies — must never escape. */
const RAW_BODY_MARKER = 'RAW_PROVIDER_DETAIL_SHOULD_NOT_LEAK';

const GOOD_RESPONSE = {
  model: 'gpt-4.1-mini-2025-04-14',
  choices: [
    {
      message: { role: 'assistant', content: 'Hello there.' },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
};

const adapter = new OpenAiAdapter();

function mockFetch(opts: {
  ok: boolean;
  status: number;
  body: unknown;
}): jest.SpyInstance {
  const text =
    typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  return jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: opts.ok,
    status: opts.status,
    text: async () => text,
  } as unknown as Response);
}

function initOf(spy: jest.SpyInstance): RequestInit {
  return spy.mock.calls[0][1] as RequestInit;
}

function bodyOf(spy: jest.SpyInstance): any {
  return JSON.parse(initOf(spy).body as string);
}

/** No credential / header / raw provider text in any serialized view of `err`. */
function assertSafe(err: unknown): void {
  const views = [
    String(err),
    JSON.stringify(err),
    JSON.stringify(err, Object.getOwnPropertyNames(err ?? {})),
    err instanceof Error ? String(err.stack) : '',
  ].join('\n');
  expect(views).not.toContain(FAKE_KEY);
  expect(views).not.toContain('sk-test');
  expect(views).not.toContain('Bearer ');
  expect(views.toLowerCase()).not.toContain('authorization');
  expect(views).not.toContain(RAW_BODY_MARKER);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('OpenAiAdapter — request shaping', () => {
  it('POSTs to the chat-completions endpoint with the bearer header and a user-only body', async () => {
    const spy = mockFetch({ ok: true, status: 200, body: GOOD_RESPONSE });

    await adapter.complete({ model: 'gpt-4.1-mini', prompt: 'Hello' }, FAKE_KEY);

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(headers['content-type']).toBe('application/json');
    expect(bodyOf(spy)).toEqual({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('includes a system message first when system is supplied', async () => {
    const spy = mockFetch({ ok: true, status: 200, body: GOOD_RESPONSE });

    await adapter.complete(
      { model: 'gpt-4.1', prompt: 'Q', system: 'You are terse.' },
      FAKE_KEY,
    );

    expect(bodyOf(spy).messages).toEqual([
      { role: 'system', content: 'You are terse.' },
      { role: 'user', content: 'Q' },
    ]);
  });

  it('omits the system message when system is absent or blank', async () => {
    const spy = mockFetch({ ok: true, status: 200, body: GOOD_RESPONSE });

    await adapter.complete(
      { model: 'gpt-4.1', prompt: 'Q', system: '   ' },
      FAKE_KEY,
    );

    expect(bodyOf(spy).messages).toEqual([{ role: 'user', content: 'Q' }]);
  });

  it('sends max_tokens only when maxOutputTokens is a positive number', async () => {
    const withCap = mockFetch({ ok: true, status: 200, body: GOOD_RESPONSE });
    await adapter.complete(
      { model: 'gpt-4.1', prompt: 'Q', maxOutputTokens: 256 },
      FAKE_KEY,
    );
    expect(bodyOf(withCap).max_tokens).toBe(256);
    jest.restoreAllMocks();

    const noCap = mockFetch({ ok: true, status: 200, body: GOOD_RESPONSE });
    await adapter.complete(
      { model: 'gpt-4.1', prompt: 'Q', maxOutputTokens: 0 },
      FAKE_KEY,
    );
    expect('max_tokens' in bodyOf(noCap)).toBe(false);
  });

  it('forwards the provided AbortSignal to fetch', async () => {
    const spy = mockFetch({ ok: true, status: 200, body: GOOD_RESPONSE });
    const controller = new AbortController();

    await adapter.complete(
      { model: 'gpt-4.1', prompt: 'Q', signal: controller.signal },
      FAKE_KEY,
    );

    expect(initOf(spy).signal).toBe(controller.signal);
  });
});

describe('OpenAiAdapter — response normalization', () => {
  it('normalizes text, model, usage and finishReason on success', async () => {
    mockFetch({ ok: true, status: 200, body: GOOD_RESPONSE });

    const result = await adapter.complete(
      { model: 'gpt-4.1-mini', prompt: 'Hi' },
      FAKE_KEY,
    );

    expect(result).toEqual({
      text: 'Hello there.',
      model: 'gpt-4.1-mini-2025-04-14',
      usage: { inputTokens: 12, outputTokens: 5 },
      finishReason: 'stop',
    });
  });

  it('falls back to the requested model, zero usage, and null finishReason when omitted', async () => {
    mockFetch({
      ok: true,
      status: 200,
      body: { choices: [{ message: { content: 'x' } }] },
    });

    const result = await adapter.complete(
      { model: 'gpt-4.1', prompt: 'Hi' },
      FAKE_KEY,
    );

    expect(result).toEqual({
      text: 'x',
      model: 'gpt-4.1',
      usage: { inputTokens: 0, outputTokens: 0 },
      finishReason: null,
    });
  });

  it.each([
    ['non-JSON body', 'totally not json'],
    ['no choices array', JSON.stringify({ usage: {} })],
    ['empty choices array', JSON.stringify({ choices: [] })],
    [
      'choice with non-string content',
      JSON.stringify({ choices: [{ message: { content: null } }] }),
    ],
    [
      'choice with no message',
      JSON.stringify({ choices: [{ finish_reason: 'stop' }] }),
    ],
  ])('treats a malformed 200 (%s) as PROVIDER_ERROR', async (_label, body) => {
    mockFetch({ ok: true, status: 200, body });

    const err: any = await adapter
      .complete({ model: 'gpt-4.1', prompt: 'Q' }, FAKE_KEY)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.code).toBe('PROVIDER_ERROR');
    assertSafe(err);
  });

  it('maps a content_filter finish_reason to CONTENT_FILTER instead of returning empty text', async () => {
    mockFetch({
      ok: true,
      status: 200,
      body: {
        choices: [{ message: { content: '' }, finish_reason: 'content_filter' }],
      },
    });

    const err: any = await adapter
      .complete({ model: 'gpt-4.1', prompt: 'Q' }, FAKE_KEY)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.code).toBe('CONTENT_FILTER');
  });
});

describe('OpenAiAdapter — error mapping', () => {
  it.each([
    [401, 'AUTH_FAILED'],
    [403, 'AUTH_FAILED'],
    [429, 'RATE_LIMITED'],
    [400, 'BAD_REQUEST'],
    [500, 'PROVIDER_ERROR'],
    [503, 'PROVIDER_ERROR'],
  ])('maps HTTP %s to %s (status preserved, body never leaked)', async (status, code) => {
    mockFetch({
      ok: false,
      status,
      body: { error: { message: RAW_BODY_MARKER, type: 'x', code: 'y' } },
    });

    const err: any = await adapter
      .complete({ model: 'gpt-4.1', prompt: 'Q' }, FAKE_KEY)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.code).toBe(code);
    expect(err.provider).toBe('openai');
    expect(err.status).toBe(status);
    assertSafe(err);
  });

  it('maps an error.code of content_filter (HTTP 400) to CONTENT_FILTER', async () => {
    mockFetch({
      ok: false,
      status: 400,
      body: { error: { code: 'content_filter', message: RAW_BODY_MARKER } },
    });

    const err: any = await adapter
      .complete({ model: 'gpt-4.1', prompt: 'Q' }, FAKE_KEY)
      .catch((e) => e);

    expect(err.code).toBe('CONTENT_FILTER');
    assertSafe(err);
  });

  it('maps an AbortError to TIMEOUT', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
      );

    const err: any = await adapter
      .complete({ model: 'gpt-4.1', prompt: 'Q' }, FAKE_KEY)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.code).toBe('TIMEOUT');
    assertSafe(err);
  });

  it('maps a generic network failure to PROVIDER_ERROR', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('ECONNRESET'));

    const err: any = await adapter
      .complete({ model: 'gpt-4.1', prompt: 'Q' }, FAKE_KEY)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.code).toBe('PROVIDER_ERROR');
  });
});

describe('OpenAiAdapter — local input validation', () => {
  it.each([
    ['missing api key', { model: 'gpt-4.1', prompt: 'Q' }, '', 'MISSING_API_KEY'],
    ['blank model', { model: '   ', prompt: 'Q' }, FAKE_KEY, 'MISSING_MODEL'],
    ['empty prompt', { model: 'gpt-4.1', prompt: '   ' }, FAKE_KEY, 'EMPTY_PROMPT'],
  ])('rejects %s locally and never calls fetch', async (_label, request, key, code) => {
    const spy = jest.spyOn(globalThis, 'fetch');

    const err: any = await adapter
      .complete(request as any, key)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AiInvalidRequestError);
    expect(err.code).toBe(code);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('OpenAiAdapter — security', () => {
  it('never puts the key, the Authorization header, or the raw provider body in a thrown error', async () => {
    mockFetch({
      ok: false,
      status: 401,
      body: {
        error: {
          message: `${RAW_BODY_MARKER} for ${FAKE_KEY}`,
          type: 'invalid_request_error',
        },
      },
    });

    const err: any = await adapter
      .complete(
        { model: 'gpt-4.1', prompt: 'secret prompt text', system: 'sys' },
        FAKE_KEY,
      )
      .catch((e) => e);

    expect(err).toBeInstanceOf(AiProviderError);
    assertSafe(err);
    expect(err.message).toBe('OpenAI authentication failed.');
  });

  it('does not log the key, header, or provider body', async () => {
    const consoleSpies = (
      ['log', 'warn', 'error', 'info', 'debug'] as const
    ).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));

    mockFetch({
      ok: false,
      status: 429,
      body: { error: { message: RAW_BODY_MARKER } },
    });

    await adapter
      .complete(
        { model: 'gpt-4.1', prompt: 'p', system: 's' },
        FAKE_KEY,
      )
      .catch(() => undefined);

    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
