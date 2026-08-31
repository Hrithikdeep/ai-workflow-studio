import {
  IntegrationProbeService,
  type ProbeResult,
} from './integration-probe.service';
import {
  isSupportedProvider,
  splitProviderConfig,
  SUPPORTED_PROVIDERS,
  PROVIDER_SECRET_FIELDS,
} from './integration-providers';

/**
 * Offline unit tests for the OpenAI integration probe (Step 2).
 *
 * `fetch` is mocked — no network, no real API key. The key used here is a
 * throwaway literal and must never appear in any probe result.
 */

const FAKE_KEY = 'sk-not-a-real-key-abc123-do-not-log-or-return';

const probeService = new IntegrationProbeService();

/** Run the OpenAI branch through the public `probe()` entry point. */
function probeOpenAi(secrets: Record<string, unknown>) {
  return probeService.probe('openai', {}, secrets, { timeoutMs: 2000 });
}

function mockFetch(
  impl: (url: string, init: RequestInit) => Promise<unknown> | unknown,
): jest.SpyInstance {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input: unknown, init: unknown) =>
      Promise.resolve(
        impl(String(input), (init ?? {}) as RequestInit) as Response,
      ),
    );
}

describe('OpenAI provider registration', () => {
  // A — the provider is recognized by the existing registry
  it('registers "openai" as a supported provider', () => {
    expect(SUPPORTED_PROVIDERS).toContain('openai');
    expect(isSupportedProvider('openai')).toBe(true);
  });

  // B — apiKey is classified as a secret by the existing split logic
  it('classifies apiKey as a secret and keeps it out of non-secret config', () => {
    expect(PROVIDER_SECRET_FIELDS.openai).toEqual(['apiKey']);

    const { config, secrets } = splitProviderConfig('openai', {
      apiKey: FAKE_KEY,
      description: 'Prod OpenAI',
    });

    expect(secrets).toEqual({ apiKey: FAKE_KEY });
    expect(config).toEqual({ description: 'Prod OpenAI' });
    expect(JSON.stringify(config)).not.toContain(FAKE_KEY);
  });
});

describe('IntegrationProbeService.probe("openai")', () => {
  let fetchSpy: jest.SpyInstance | undefined;

  afterEach(() => {
    fetchSpy?.mockRestore();
    fetchSpy = undefined;
    jest.restoreAllMocks();
  });

  // E — a valid key authenticates and reports connected-worthy success
  it('returns ok:true / OK for a 200 from /v1/models and sends a Bearer header', async () => {
    fetchSpy = mockFetch(() => ({
      ok: true,
      status: 200,
      json: async () => ({
        object: 'list',
        data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }],
      }),
    }));

    const result = await probeOpenAi({ apiKey: FAKE_KEY });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/models');
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${FAKE_KEY}`,
    );

    expect(result.ok).toBe(true);
    expect(result.code).toBe('OK');
    expect(result.message).toContain('2 models');
    assertNoKey(result);
  });

  it('still succeeds on a 200 with an unreadable body', async () => {
    fetchSpy = mockFetch(() => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    }));

    const result = await probeOpenAi({ apiKey: FAKE_KEY });
    expect(result.ok).toBe(true);
    expect(result.code).toBe('OK');
    assertNoKey(result);
  });

  // F — invalid / unauthorized key
  it.each([401, 403])(
    'returns a safe AUTH_FAILED error for HTTP %s',
    async (status) => {
      fetchSpy = mockFetch(() => ({
        ok: false,
        status,
        json: async () => ({
          error: { message: `bad key ${FAKE_KEY}`, code: 'invalid_api_key' },
        }),
      }));

      const result = await probeOpenAi({ apiKey: FAKE_KEY });

      expect(result.ok).toBe(false);
      expect(result.code).toBe('AUTH_FAILED');
      expect(result.message).toBe('OpenAI rejected the API key.');
      assertNoKey(result);
    },
  );

  // H — rate limited / quota exceeded
  it('returns RATE_LIMITED for HTTP 429', async () => {
    fetchSpy = mockFetch(() => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'slow down' } }),
    }));

    const result = await probeOpenAi({ apiKey: FAKE_KEY });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('RATE_LIMITED');
    expect(result.message).toMatch(/rate-limit/i);
    assertNoKey(result);
  });

  it('returns UNREACHABLE for a 5xx from the provider', async () => {
    fetchSpy = mockFetch(() => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));

    const result = await probeOpenAi({ apiKey: FAKE_KEY });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('UNREACHABLE');
    assertNoKey(result);
  });

  it('returns PROBE_ERROR for an unexpected non-2xx status', async () => {
    fetchSpy = mockFetch(() => ({
      ok: false,
      status: 418,
      json: async () => ({}),
    }));

    const result = await probeOpenAi({ apiKey: FAKE_KEY });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PROBE_ERROR');
    assertNoKey(result);
  });

  // G — timeout
  it('returns a safe TIMEOUT error when the request is aborted', async () => {
    fetchSpy = mockFetch(() => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });

    const result = await probeOpenAi({ apiKey: FAKE_KEY });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('TIMEOUT');
    assertNoKey(result);
  });

  it('returns UNREACHABLE for a generic network failure', async () => {
    fetchSpy = mockFetch(() => {
      throw new Error('ECONNREFUSED');
    });

    const result = await probeOpenAi({ apiKey: FAKE_KEY });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('UNREACHABLE');
    assertNoKey(result);
  });

  it('returns MISSING_CREDENTIAL and never calls fetch when no key is stored', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');

    const result = await probeOpenAi({});

    expect(result.ok).toBe(false);
    expect(result.code).toBe('MISSING_CREDENTIAL');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // I — the outer catch in probe() also never leaks the key
  it('never exposes the API key even when the probe itself throws', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error(`boom with ${FAKE_KEY}`);
    });

    const result = await probeOpenAi({ apiKey: FAKE_KEY });
    expect(result.ok).toBe(false);
    assertNoKey(result);
  });
});

function assertNoKey(result: ProbeResult): void {
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain(FAKE_KEY);
  expect(serialized).not.toContain('Bearer');
  expect(serialized).not.toContain('sk-');
}
