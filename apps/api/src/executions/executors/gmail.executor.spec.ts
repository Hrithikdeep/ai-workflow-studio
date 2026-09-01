import { ExecutionStepStatus } from '@prisma/client';

import { GmailNodeExecutor } from './gmail.executor';
import { GmailClient, GoogleApiError } from '../../integrations/gmail/gmail-client';
import type { NodeExecutionContext } from './node-executor';

const ACCESS = 'ya29.SECRET-ACCESS-TOKEN';
const REFRESH = '1//SECRET-REFRESH-TOKEN';

function makeExecutor(over?: {
  integration?: unknown;
  freshToken?: () => Promise<{ accessToken: string; scope?: string }>;
  send?: jest.Mock;
}) {
  const integrations = {
    getForExecution: jest.fn().mockResolvedValue(
      over && 'integration' in over
        ? over.integration
        : { id: 'int-1', provider: 'gmail', name: 'Gmail' },
    ),
  };
  const oauth = {
    getFreshAccessToken:
      over?.freshToken ??
      jest.fn().mockResolvedValue({ accessToken: ACCESS, scope: 'gmail.send' }),
  };
  const client = new GmailClient();
  const send =
    over?.send ??
    jest.fn().mockResolvedValue({ id: 'msg-123', threadId: 'thr-9' });
  jest.spyOn(client, 'sendMessage').mockImplementation(send);

  const executor = new GmailNodeExecutor(
    integrations as never,
    oauth as never,
    client,
  );
  return { executor, integrations, oauth, send };
}

const node = { id: 'n-gmail-1', label: 'Gmail: Send', type: 'GMAIL' };
const ctx = (workspaceId?: string): NodeExecutionContext => ({
  workspaceId,
  workflow: { id: 'wf', versionId: 'v' },
  execution: { id: 'ex', triggerType: 'MANUAL' },
  input: {},
  variables: {},
  previous: {},
});
const goodConfig = {
  integrationId: 'int-1',
  to: 'user@example.com',
  subject: 'Welcome',
  body: 'Hello there',
};

describe('GmailNodeExecutor', () => {
  afterEach(() => jest.restoreAllMocks());

  it('20/1. requires integrationId + to + subject + body; config carries no token', async () => {
    const { executor, send } = makeExecutor();
    for (const missing of ['integrationId', 'to', 'subject', 'body']) {
      const cfg = { ...goodConfig, [missing]: '' };
      const res = await executor.execute(node, cfg, ctx('ws-1'));
      expect(res.status).toBe(ExecutionStepStatus.FAILED);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('17. resolves the integration workspace-scoped and does not send for a foreign integration', async () => {
    const { executor, integrations, send } = makeExecutor({ integration: null });
    const res = await executor.execute(node, goodConfig, ctx('ws-A'));
    expect(integrations.getForExecution).toHaveBeenCalledWith('ws-A', 'int-1');
    expect(res.status).toBe(ExecutionStepStatus.FAILED);
    expect(res.output.code).toBe('INTEGRATION_NOT_FOUND');
    expect(send).not.toHaveBeenCalled();
  });

  it('no workspace context -> controlled failure, no send', async () => {
    const { executor, send } = makeExecutor();
    const res = await executor.execute(node, goodConfig, ctx(undefined));
    expect(res.status).toBe(ExecutionStepStatus.FAILED);
    expect(res.output.code).toBe('NO_WORKSPACE');
    expect(send).not.toHaveBeenCalled();
  });

  it('6. wrong provider on the resolved integration -> INTEGRATION_NOT_FOUND, no send', async () => {
    const { executor, integrations, send } = makeExecutor({
      // integration row exists in the workspace but is not a Gmail one
      integration: { id: 'int-1', provider: 'postgresql', name: 'App DB', config: {} },
    });
    const res = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect(integrations.getForExecution).toHaveBeenCalledWith('ws-1', 'int-1');
    expect(res.status).toBe(ExecutionStepStatus.FAILED);
    expect(res.output.code).toBe('INTEGRATION_NOT_FOUND');
    expect(send).not.toHaveBeenCalled();
  });

  it('7. credential decryption failure -> sanitized failure, no send, no leak', async () => {
    const { executor, send } = makeExecutor({
      freshToken: jest
        .fn()
        .mockRejectedValue(
          new Error('decrypt failed for cred blob v1:xxxx (ya29.PEEK)'),
        ),
    });
    const res = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect(res.status).toBe(ExecutionStepStatus.FAILED);
    expect(res.output.code).toBe('GMAIL_ERROR');
    expect(res.error).toBe('Gmail rejected the request.');
    expect(JSON.stringify(res)).not.toMatch(/decrypt failed|ya29|v1:/);
    expect(send).not.toHaveBeenCalled();
  });

  it('9. a Google error carrying sensitive text is not surfaced verbatim', async () => {
    const { executor } = makeExecutor({
      send: jest
        .fn()
        .mockRejectedValue(
          new GoogleApiError(
            'INVALID_ARGUMENT',
            400,
            'request had Authorization: Bearer ya29.SECRET and was invalid',
          ),
        ),
    });
    const res = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect(res.status).toBe(ExecutionStepStatus.FAILED);
    expect(res.output.code).toBe('INVALID_MESSAGE');
    // the mapped, safe message is returned — not Google's raw string
    expect(res.error).toBe(
      'Gmail rejected the message (invalid recipient or content).',
    );
    const s = JSON.stringify(res);
    expect(s).not.toContain('ya29');
    expect(s).not.toContain('Bearer');
  });

  it('19. missing credential -> MISSING_CREDENTIAL', async () => {
    const { executor, send } = makeExecutor({
      freshToken: jest
        .fn()
        .mockRejectedValue(new GoogleApiError('missing_credential', 0, 'x')),
    });
    const res = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect(res.output.code).toBe('MISSING_CREDENTIAL');
    expect(send).not.toHaveBeenCalled();
  });

  it('16. revoked authorization -> AUTH_REVOKED', async () => {
    const { executor } = makeExecutor({
      freshToken: jest
        .fn()
        .mockRejectedValue(new GoogleApiError('invalid_grant', 400, 'x')),
    });
    const res = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect(res.output.code).toBe('AUTH_REVOKED');
  });

  it('22. sends a real message and returns the Gmail message id', async () => {
    const { executor, send } = makeExecutor();
    const res = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect(send).toHaveBeenCalledTimes(1);
    const [token, raw] = send.mock.calls[0];
    expect(token).toBe(ACCESS);
    // raw is a base64url MIME containing the resolved To/Subject/Body
    const mime = Buffer.from(raw, 'base64url').toString('utf8');
    expect(mime).toContain('To: user@example.com');
    expect(mime).toContain('Subject: Welcome');
    expect(mime).toContain('Hello there');

    expect(res.status).toBe(ExecutionStepStatus.SUCCEEDED);
    expect(res.output.gmail).toEqual({ id: 'msg-123', threadId: 'thr-9' });
  });

  it('21. resolved variable values reach the executor (resolution done upstream)', async () => {
    const { executor, send } = makeExecutor();
    // ExecutionsService resolves templates before calling the executor;
    // here we pass the already-resolved config.
    await executor.execute(
      node,
      { integrationId: 'int-1', to: 'ada@example.com', subject: 'Welcome Ada', body: 'Hi Ada' },
      ctx('ws-1'),
    );
    const mime = Buffer.from(send.mock.calls[0][1], 'base64url').toString('utf8');
    expect(mime).toContain('To: ada@example.com');
    expect(mime).toContain('Subject: Welcome Ada');
    expect(mime).toContain('Hi Ada');
  });

  it('23. Gmail API failure -> mapped, no fake success', async () => {
    const { executor } = makeExecutor({
      send: jest
        .fn()
        .mockRejectedValue(new GoogleApiError('PERMISSION_DENIED', 403, 'x')),
    });
    const res = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect(res.status).toBe(ExecutionStepStatus.FAILED);
    expect(res.output.code).toBe('INSUFFICIENT_SCOPE');
  });

  it('24/25. access & refresh tokens never appear in the node result', async () => {
    const { executor } = makeExecutor({
      freshToken: jest.fn().mockResolvedValue({ accessToken: ACCESS }),
    });
    const res = await executor.execute(node, goodConfig, ctx('ws-1'));
    const s = JSON.stringify(res);
    expect(s).not.toContain(ACCESS);
    expect(s).not.toContain(REFRESH);
    expect(s).not.toContain('ya29');
    expect(s).not.toContain('Bearer');
    expect(res.output.config).toEqual({
      integrationId: 'int-1',
      to: 'user@example.com',
      subject: 'Welcome',
      body: 'Hello there',
    });
  });

  it('one automatic retry on UNAUTHENTICATED, then honest failure', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(new GoogleApiError('UNAUTHENTICATED', 401, 'x'))
      .mockRejectedValueOnce(new GoogleApiError('UNAUTHENTICATED', 401, 'x'));
    const freshToken = jest.fn().mockResolvedValue({ accessToken: ACCESS });
    const { executor } = makeExecutor({ send, freshToken });
    const res = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect(freshToken).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(ExecutionStepStatus.FAILED);
  });

  it('FAILED_PRECONDITION -> explicit, actionable mapping (account cannot send)', async () => {
    const { executor } = makeExecutor({
      send: jest
        .fn()
        .mockRejectedValue(
          new GoogleApiError(
            'FAILED_PRECONDITION',
            400,
            'Gmail rejected the message.',
            'failedPrecondition: Precondition check failed.',
          ),
        ),
    });
    const res = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect(res.status).toBe(ExecutionStepStatus.FAILED);
    expect(res.output.code).toBe('FAILED_PRECONDITION');
    expect(res.error).toMatch(/Workspace administrator|not able to send mail/i);
    // Google's own reason text is appended for the operator.
    expect(res.error).toContain('Precondition check failed.');
  });

  it('unmapped Google failure -> execution error carries slug + HTTP status + Google message', async () => {
    const { executor } = makeExecutor({
      send: jest
        .fn()
        .mockRejectedValue(
          new GoogleApiError(
            'gmail_send_failed',
            503,
            'Gmail rejected the message.',
            'backendError: The service is currently unavailable.',
          ),
        ),
    });
    const res = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect(res.status).toBe(ExecutionStepStatus.FAILED);
    expect(res.output.code).toBe('GMAIL_ERROR');
    expect(res.error).toContain('gmail_send_failed');
    expect(res.error).toContain('HTTP 503');
    expect(res.error).toContain('The service is currently unavailable.');
  });

  it('a non-GoogleApiError still yields the exact generic message (no slug/status)', async () => {
    const { executor } = makeExecutor({
      send: jest.fn().mockRejectedValue(new Error('socket hang up')),
    });
    const res = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect(res.output.code).toBe('GMAIL_ERROR');
    expect(res.error).toBe('Gmail rejected the request.');
  });

  it('token-shaped text in the Google detail is scrubbed before it reaches the record', async () => {
    const { executor } = makeExecutor({
      send: jest
        .fn()
        .mockRejectedValue(
          new GoogleApiError(
            'gmail_send_failed',
            500,
            'Gmail rejected the message.',
            'failed with Authorization: Bearer ya29.LEAKED-TOKEN-VALUE',
          ),
        ),
    });
    const res = await executor.execute(node, goodConfig, ctx('ws-1'));
    const s = JSON.stringify(res);
    expect(s).not.toContain('LEAKED-TOKEN-VALUE');
    expect(s).not.toMatch(/Bearer\s+ya29/);
    expect(s).not.toMatch(/ya29\.[A-Za-z0-9-]{4,}/);
    // the detail is still surfaced, just with the token redacted
    expect(res.error).toContain('***');
  });
});
