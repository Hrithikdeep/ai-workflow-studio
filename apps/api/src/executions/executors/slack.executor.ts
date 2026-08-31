import { Injectable, Logger } from '@nestjs/common';
import { ExecutionStepStatus } from '@prisma/client';

import { IntegrationsService } from '../../integrations/integrations.service';
import { IntegrationCredentialsService } from '../../integrations/integration-credentials.service';
import type {
  ExecutorNode,
  NodeExecutionContext,
  NodeExecutionResult,
} from './node-executor';

const SLACK_POST_MESSAGE_URL = 'https://slack.com/api/chat.postMessage';
const SLACK_TIMEOUT_MS = 10_000;

/**
 * Executes a `SLACK` workflow node: posts a message to a Slack channel
 * using the bot token stored (encrypted) on a saved Slack integration in
 * the execution's workspace.
 *
 * The decrypted token is used only for the outgoing request. It never
 * appears in the node result, the execution record, thrown errors, or
 * logs.
 */
@Injectable()
export class SlackNodeExecutor {
  private readonly logger = new Logger(SlackNodeExecutor.name);

  constructor(
    private readonly integrations: IntegrationsService,
    private readonly credentials: IntegrationCredentialsService,
  ) {}

  async execute(
    node: ExecutorNode,
    resolvedConfig: Record<string, unknown>,
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> {
    const integrationId = trimmed(resolvedConfig.integrationId);
    const channel = trimmed(resolvedConfig.channel);
    const message =
      typeof resolvedConfig.message === 'string'
        ? resolvedConfig.message
        : resolvedConfig.message == null
          ? ''
          : String(resolvedConfig.message);

    // Echoed into the execution log — contains no secret.
    const safeConfig = { integrationId, channel, message };

    const fail = (error: string, code: string): NodeExecutionResult => ({
      status: ExecutionStepStatus.FAILED,
      output: {
        nodeId: node.id,
        nodeType: 'SLACK',
        label: node.label,
        config: safeConfig,
        code,
        status: 'FAILED',
      },
      error,
      branch: null,
    });

    const succeed = (slack: Record<string, unknown>): NodeExecutionResult => ({
      status: ExecutionStepStatus.SUCCEEDED,
      output: {
        nodeId: node.id,
        nodeType: 'SLACK',
        label: node.label,
        config: safeConfig,
        slack,
        status: 'SUCCEEDED',
      },
      error: null,
      branch: null,
    });

    if (!integrationId) {
      return fail('Slack integration is not configured.', 'MISSING_INTEGRATION');
    }
    if (!channel) {
      return fail('A Slack channel is required.', 'MISSING_CONFIG');
    }
    if (!message) {
      return fail('A Slack message is required.', 'MISSING_CONFIG');
    }
    if (!context.workspaceId) {
      return fail(
        'Slack integration is not available in this workspace.',
        'NO_WORKSPACE',
      );
    }

    const integration = await this.integrations.getForExecution(
      context.workspaceId,
      integrationId,
    );
    if (!integration || integration.provider !== 'slack') {
      // Do not reveal whether the integration exists in another workspace.
      return fail(
        'Slack integration is not available in this workspace.',
        'INTEGRATION_NOT_FOUND',
      );
    }

    const secrets = await this.credentials.getDecryptedForIntegration(
      context.workspaceId,
      integrationId,
    );
    const token = firstString(secrets?.botToken, secrets?.credential);
    if (!token) {
      return fail(
        'The Slack integration has no stored credential.',
        'MISSING_CREDENTIAL',
      );
    }

    let body: SlackResponse;
    try {
      const res = await fetch(SLACK_POST_MESSAGE_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ channel, text: message }),
        signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
      });
      body = (await res.json().catch(() => ({}))) as SlackResponse;
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      const timedOut = name === 'TimeoutError' || name === 'AbortError';
      this.logger.warn(
        `Slack node ${node.id}: request ${timedOut ? 'timed out' : 'failed'}`,
      );
      return timedOut
        ? fail('Slack API request timed out.', 'TIMEOUT')
        : fail('Could not reach the Slack API.', 'NETWORK');
    }

    if (body && body.ok === true) {
      return succeed({
        ok: true,
        channel: trimmed(body.channel) || channel,
        ts: trimmed(body.ts) || undefined,
      });
    }

    const slackError = trimmed(body?.error) || 'unknown_error';
    this.logger.warn(`Slack node ${node.id}: Slack returned "${slackError}"`);
    return fail(mapSlackError(slackError), slackError.toUpperCase());
  }
}

interface SlackResponse {
  ok?: boolean;
  error?: string;
  channel?: string;
  ts?: string;
}

function trimmed(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return undefined;
}

/** Map a Slack API error slug to a safe, user-facing message. */
function mapSlackError(code: string): string {
  switch (code) {
    case 'invalid_auth':
    case 'not_authed':
    case 'token_revoked':
    case 'token_expired':
    case 'account_inactive':
      return 'Slack rejected the credential.';
    case 'channel_not_found':
      return 'Slack channel was not found.';
    case 'not_in_channel':
      return 'The Slack app is not a member of that channel.';
    case 'is_archived':
      return 'That Slack channel is archived.';
    case 'missing_scope':
    case 'no_permission':
      return 'The Slack credential is missing a required permission (chat:write).';
    case 'ratelimited':
    case 'rate_limited':
      return 'Slack rate limited the request. Try again shortly.';
    case 'msg_too_long':
      return 'The Slack message is too long.';
    default:
      return `Slack rejected the request (${code}).`;
  }
}
