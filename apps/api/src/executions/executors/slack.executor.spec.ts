import { ExecutionStepStatus } from '@prisma/client';

import { SlackNodeExecutor } from './slack.executor';
import type { NodeExecutionContext } from './node-executor';

const TOKEN = 'xoxb-super-secret-not-in-config-or-output';

type FakeIntegrations = {
  getForExecution: jest.Mock;
};
type FakeCredentials = {
  getDecryptedForIntegration: jest.Mock;
};

function makeExecutor(overrides?: {
  integration?: unknown;
  secrets?: Record<string, unknown> | null;
}) {
  const integrations: FakeIntegrations = {
    getForExecution: jest.fn().mockResolvedValue(
      overrides && 'integration' in overrides
        ? overrides.integration
        : { id: 'int-1', provider: 'slack', name: 'Prod Slack' },
    ),
  };
  const credentials: FakeCredentials = {
    getDecryptedForIntegration: jest.fn().mockResolvedValue(
      overrides && 'secrets' in overrides
        ? overrides.secrets
        : { credential: TOKEN },
    ),
  };
  const executor = new SlackNodeExecutor(
    integrations as never,
    credentials as never,
  );
  return { executor, integrations, credentials };
}

const node = { id: 'node-slack-1', label: 'Slack: Send Message', type: 'SLACK' };
const ctx = (workspaceId?: string): NodeExecutionContext => ({
  workspaceId,
  workflow: { id: 'wf-1', versionId: 'v-1' },
  execution: { id: 'exec-1', triggerType: 'MANUAL' },
  input: {},
  variables: {},
  previous: {},
});

const goodConfig = {
  integrationId: 'int-1',
  channel: '#alerts',
  message: 'hello from a workflow',
};

describe('SlackNodeExecutor', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy?.mockRestore();
    jest.restoreAllMocks();
  });

  function mockSlack(payload: Record<string, unknown>, ok = true) {
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok,
        json: async () => payload,
      } as unknown as Response);
  }

  it('resolves the credential server-side and posts to the real Slack endpoint', async () => {
    mockSlack({ ok: true, channel: 'C123', ts: '1700000000.000100' });
    const { executor, integrations, credentials } = makeExecutor();

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect(integrations.getForExecution).toHaveBeenCalledWith('ws-1', 'int-1');
    expect(credentials.getDecryptedForIntegration).toHaveBeenCalledWith(
      'ws-1',
      'int-1',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect((init as RequestInit).method).toBe('POST');
    expect(
      (init as RequestInit).headers as Record<string, string>,
    ).toMatchObject({ authorization: `Bearer ${TOKEN}` });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      channel: '#alerts',
      text: 'hello from a workflow',
    });

    expect(result.status).toBe(ExecutionStepStatus.SUCCEEDED);
    expect(result.error).toBeNull();
    expect(result.output.slack).toMatchObject({ ok: true });
  });

  it('never puts the token in the node result / output / error', async () => {
    mockSlack({ ok: true, channel: 'C1', ts: '1.2' });
    const { executor } = makeExecutor();

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain('xoxb-');
    expect(serialized).not.toContain('Bearer');
    // Only the safe config keys are echoed.
    expect(result.output.config).toEqual({
      integrationId: 'int-1',
      channel: '#alerts',
      message: 'hello from a workflow',
    });
  });

  it('maps a Slack API failure to a safe message without faking success', async () => {
    mockSlack({ ok: false, error: 'channel_not_found' });
    const { executor } = makeExecutor();

    const result = await executor.execute(node, goodConfig, ctx('ws-1'));

    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect(result.error).toBe('Slack channel was not found.');
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('maps invalid_auth to a credential-rejected message', async () => {
    mockSlack({ ok: false, error: 'invalid_auth' });
    const { executor } = makeExecutor();
    const result = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect(result.error).toBe('Slack rejected the credential.');
  });

  it('returns a controlled error when the integration is not in this workspace', async () => {
    // Simulates workspace A running against workspace B's integration id.
    const { executor, integrations } = makeExecutor({ integration: null });
    fetchSpy = jest.spyOn(globalThis, 'fetch');

    const result = await executor.execute(node, goodConfig, ctx('ws-A'));

    expect(integrations.getForExecution).toHaveBeenCalledWith('ws-A', 'int-1');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect(result.error).toBe(
      'Slack integration is not available in this workspace.',
    );
    // Must not disclose that it exists elsewhere.
    expect(result.error).not.toMatch(/other|another|workspace B|belongs/i);
  });

  it('returns a controlled error when integrationId is missing', async () => {
    const { executor } = makeExecutor();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    const result = await executor.execute(
      node,
      { channel: '#x', message: 'hi' },
      ctx('ws-1'),
    );
    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect(result.error).toBe('Slack integration is not configured.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns a controlled error when the integration has no stored credential', async () => {
    const { executor } = makeExecutor({ secrets: null });
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    const result = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect(result.error).toBe('The Slack integration has no stored credential.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns a controlled error when there is no workspace context', async () => {
    const { executor } = makeExecutor();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    const result = await executor.execute(node, goodConfig, ctx(undefined));
    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect(result.error).toBe(
      'Slack integration is not available in this workspace.',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports an honest timeout', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(
      Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
    );
    const { executor } = makeExecutor();
    const result = await executor.execute(node, goodConfig, ctx('ws-1'));
    expect(result.status).toBe(ExecutionStepStatus.FAILED);
    expect(result.error).toBe('Slack API request timed out.');
  });
});
