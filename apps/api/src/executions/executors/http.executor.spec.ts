import { ExecutionStepStatus } from '@prisma/client';

import { HttpNodeExecutor } from './http.executor';
import type { NodeExecutionContext } from './node-executor';

const SECRET = 'Bearer sk-super-secret-token';

function makeResponse(
  body: string,
  init?: { status?: number; statusText?: string; headers?: Record<string, string> },
): Response {
  const status = init?.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init?.statusText ?? 'OK',
    headers: new Headers(init?.headers ?? { 'content-type': 'application/json' }),
    text: async () => body,
  } as unknown as Response;
}

const node = { id: 'n-http-1', label: 'HTTP: Call API', type: 'HTTP_REQUEST' };
const ctx = (): NodeExecutionContext => ({
  workspaceId: 'ws-1',
  workflow: { id: 'wf', versionId: 'v' },
  execution: { id: 'ex', triggerType: 'MANUAL' },
  input: {},
  variables: {},
  previous: {},
});

describe('HttpNodeExecutor', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(makeResponse('{"ok":true}'));
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => jest.restoreAllMocks());

  it('1. performs a GET and returns status + parsed body', async () => {
    const exec = new HttpNodeExecutor();
    const res = await exec.execute(
      node,
      { method: 'GET', url: 'https://api.example.com/things' },
      ctx(),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toBe('https://api.example.com/things');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();

    expect(res.status).toBe(ExecutionStepStatus.SUCCEEDED);
    expect(res.output.http).toEqual(
      expect.objectContaining({ status: 200, body: { ok: true }, truncated: false }),
    );
  });

  it('2. already-resolved values reach the request (resolution happens upstream)', async () => {
    const exec = new HttpNodeExecutor();
    await exec.execute(
      node,
      {
        method: 'POST',
        url: 'https://api.example.com/users/ada',
        headers: '{"x-trace":"run-42"}',
        body: '{"name":"Ada"}',
      },
      ctx(),
    );

    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toBe('https://api.example.com/users/ada');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'x-trace': 'run-42' });
    expect(init.body).toBe('{"name":"Ada"}');
  });

  it('3. echoes a sanitised config (method, url, redacted headers, hasBody)', async () => {
    const exec = new HttpNodeExecutor();
    const res = await exec.execute(
      node,
      {
        method: 'post',
        url: 'https://api.example.com/x',
        headers: JSON.stringify({ Authorization: SECRET, 'x-ok': 'v' }),
        body: '{"a":1}',
      },
      ctx(),
    );

    expect(res.output.config).toEqual({
      method: 'POST',
      url: 'https://api.example.com/x',
      headers: { Authorization: '***', 'x-ok': 'v' },
      hasBody: true,
    });
  });

  it('4. a non-2xx response is a sanitised failure that still carries the body', async () => {
    fetchMock.mockResolvedValue(
      makeResponse('{"message":"nope"}', { status: 500, statusText: 'Server Error' }),
    );
    const exec = new HttpNodeExecutor();
    const res = await exec.execute(
      node,
      { method: 'GET', url: 'https://api.example.com/boom' },
      ctx(),
    );

    expect(res.status).toBe(ExecutionStepStatus.FAILED);
    expect(res.output.code).toBe('HTTP_500');
    expect(res.error).toBe('The request failed with status 500.');
    expect((res.output.http as Record<string, unknown>).body).toEqual({ message: 'nope' });
  });

  it('5. the Authorization header never appears in the result or errors', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const exec = new HttpNodeExecutor();
    const res = await exec.execute(
      node,
      {
        method: 'GET',
        url: 'https://user:pass@api.example.com/secure',
        headers: JSON.stringify({ authorization: SECRET, 'x-api-key': 'abc123' }),
      },
      ctx(),
    );

    const blob = JSON.stringify(res);
    expect(blob).not.toContain('sk-super-secret-token');
    expect(blob).not.toContain('abc123');
    expect(blob).not.toContain('user:pass');
    expect(res.output.config).toEqual(
      expect.objectContaining({
        url: 'https://api.example.com/secure',
        headers: { authorization: '***', 'x-api-key': '***' },
      }),
    );
    expect(res.output.code).toBe('NETWORK');
  });

  it('6. network failure -> NETWORK, timeout -> TIMEOUT', async () => {
    const exec = new HttpNodeExecutor();

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const net = await exec.execute(
      node,
      { method: 'GET', url: 'https://api.example.com/a' },
      ctx(),
    );
    expect(net.output.code).toBe('NETWORK');

    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
    );
    const to = await exec.execute(
      node,
      { method: 'GET', url: 'https://api.example.com/b' },
      ctx(),
    );
    expect(to.output.code).toBe('TIMEOUT');
    expect(to.error).toBe('The HTTP request timed out.');
  });

  it('7. a non-http(s) URL is rejected without a request', async () => {
    const exec = new HttpNodeExecutor();
    const res = await exec.execute(
      node,
      { method: 'GET', url: 'file:///etc/passwd' },
      ctx(),
    );
    expect(res.status).toBe(ExecutionStepStatus.FAILED);
    expect(res.output.code).toBe('INVALID_URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('9. a response body that reflects the sent secret has it masked', async () => {
    fetchMock.mockResolvedValue(
      makeResponse(
        JSON.stringify({ headers: { Authorization: SECRET, 'X-Api-Key': 'abc123' } }),
      ),
    );
    const exec = new HttpNodeExecutor();
    const res = await exec.execute(
      node,
      {
        method: 'GET',
        url: 'https://echo.example.com/headers',
        headers: JSON.stringify({ Authorization: SECRET, 'X-Api-Key': 'abc123' }),
      },
      ctx(),
    );

    const blob = JSON.stringify(res);
    expect(blob).not.toContain('sk-super-secret-token');
    expect(blob).not.toContain('abc123');
    expect((res.output.http as { body: { headers: Record<string, string> } }).body.headers)
      .toEqual({ Authorization: '***', 'X-Api-Key': '***' });
  });

  it('8. non-JSON / non-object headers are rejected without a request', async () => {
    const exec = new HttpNodeExecutor();
    const res = await exec.execute(
      node,
      { method: 'GET', url: 'https://api.example.com/x', headers: 'not json' },
      ctx(),
    );
    expect(res.output.code).toBe('INVALID_HEADERS');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
