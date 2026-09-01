import { Injectable, Logger } from '@nestjs/common';
import { ExecutionStepStatus } from '@prisma/client';

import { IntegrationsService } from '../../integrations/integrations.service';
import { GmailOAuthService } from '../../integrations/gmail/gmail-oauth.service';
import { GmailClient, GoogleApiError } from '../../integrations/gmail/gmail-client';
import type {
  ExecutorNode,
  NodeExecutionContext,
  NodeExecutionResult,
} from './node-executor';

/**
 * Executes a `GMAIL` workflow node: sends a real email through the Gmail API
 * using the OAuth credential stored on a saved Gmail integration in the
 * execution's workspace.
 *
 * The access / refresh tokens are used only server-side. They never appear
 * in the node result, the execution record, thrown errors, or logs.
 */
@Injectable()
export class GmailNodeExecutor {
  private readonly logger = new Logger(GmailNodeExecutor.name);

  constructor(
    private readonly integrations: IntegrationsService,
    private readonly oauth: GmailOAuthService,
    private readonly client: GmailClient,
  ) {}

  async execute(
    node: ExecutorNode,
    resolvedConfig: Record<string, unknown>,
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> {
    const integrationId = str(resolvedConfig.integrationId);
    const to = str(resolvedConfig.to);
    const subject = str(resolvedConfig.subject);
    const body =
      typeof resolvedConfig.body === 'string'
        ? resolvedConfig.body
        : resolvedConfig.body == null
          ? ''
          : String(resolvedConfig.body);

    const safeConfig = { integrationId, to, subject, body };
    const fail = (error: string, code: string): NodeExecutionResult => ({
      status: ExecutionStepStatus.FAILED,
      output: {
        nodeId: node.id,
        nodeType: 'GMAIL',
        label: node.label,
        config: safeConfig,
        code,
        status: 'FAILED',
      },
      error,
      branch: null,
    });
    const succeed = (gmail: Record<string, unknown>): NodeExecutionResult => ({
      status: ExecutionStepStatus.SUCCEEDED,
      output: {
        nodeId: node.id,
        nodeType: 'GMAIL',
        label: node.label,
        config: safeConfig,
        gmail,
        status: 'SUCCEEDED',
      },
      error: null,
      branch: null,
    });

    if (!integrationId) return fail('Gmail integration is not configured.', 'MISSING_INTEGRATION');
    if (!to) return fail('A recipient (to) is required.', 'MISSING_CONFIG');
    if (!subject) return fail('An email subject is required.', 'MISSING_CONFIG');
    if (!body) return fail('An email body is required.', 'MISSING_CONFIG');
    if (!context.workspaceId) {
      return fail('Gmail integration is not available in this workspace.', 'NO_WORKSPACE');
    }

    const integration = await this.integrations.getForExecution(
      context.workspaceId,
      integrationId,
    );
    if (!integration || integration.provider !== 'gmail') {
      return fail(
        'Gmail integration is not available in this workspace.',
        'INTEGRATION_NOT_FOUND',
      );
    }

    // Fresh access token (refreshes + persists if expired).
    let accessToken: string;
    try {
      ({ accessToken } = await this.oauth.getFreshAccessToken(
        context.workspaceId,
        integrationId,
        integration.name,
      ));
    } catch (error) {
      return this.mapGoogleFailure(node, safeConfig, error, 'auth');
    }

    // Send.
    try {
      const raw = this.client.buildRawMessage({ to, subject, body });
      const result = await this.client.sendMessage(accessToken, raw);
      return succeed({ id: result.id, threadId: result.threadId });
    } catch (error) {
      // A stale-but-unexpired token can still be rejected; try one refresh.
      if (error instanceof GoogleApiError && error.slug === 'UNAUTHENTICATED') {
        try {
          const retryToken = (
            await this.oauth.getFreshAccessToken(
              context.workspaceId,
              integrationId,
              integration.name,
            )
          ).accessToken;
          const raw = this.client.buildRawMessage({ to, subject, body });
          const result = await this.client.sendMessage(retryToken, raw);
          return succeed({ id: result.id, threadId: result.threadId });
        } catch (retryError) {
          return this.mapGoogleFailure(node, safeConfig, retryError, 'send');
        }
      }
      return this.mapGoogleFailure(node, safeConfig, error, 'send');
    }
  }

  private mapGoogleFailure(
    node: ExecutorNode,
    safeConfig: Record<string, unknown>,
    error: unknown,
    phase: 'auth' | 'send',
  ): NodeExecutionResult {
    const slug = error instanceof GoogleApiError ? error.slug : 'unknown';
    const httpStatus =
      error instanceof GoogleApiError && error.httpStatus > 0
        ? error.httpStatus
        : undefined;
    // `GmailClient` already sanitizes this; sanitize again here since this is
    // the boundary that writes the execution record.
    const googleDetail =
      error instanceof GoogleApiError
        ? sanitizeGoogleDetail(error.detail)
        : undefined;

    this.logger.warn(
      `Gmail node ${node.id}: ${phase} failed ` +
        `(slug=${slug}, httpStatus=${httpStatus ?? 'n/a'}` +
        `${googleDetail ? `, google=${JSON.stringify(googleDetail)}` : ''})`,
    );

    const { message, code } = ((): { message: string; code: string } => {
      switch (slug) {
        case 'missing_credential':
          return { message: 'The Gmail integration is not connected.', code: 'MISSING_CREDENTIAL' };
        case 'invalid_grant':
          return {
            message: 'Google authorization has been revoked. Reconnect Gmail.',
            code: 'AUTH_REVOKED',
          };
        case 'not_configured':
          return { message: 'Gmail is not configured on this server.', code: 'NOT_CONFIGURED' };
        case 'PERMISSION_DENIED':
        case 'insufficient_scope':
          return {
            message: 'The Gmail authorization is missing the send permission.',
            code: 'INSUFFICIENT_SCOPE',
          };
        case 'FAILED_PRECONDITION':
          return {
            message:
              'The connected Google account is not able to send mail through the Gmail API. ' +
              'If this is a Google Workspace account, an administrator may have disabled Gmail ' +
              'API sending; otherwise the account is not fully provisioned to send. Reconnect a ' +
              'standard Gmail account or contact your Workspace administrator.',
            code: 'FAILED_PRECONDITION',
          };
        case 'RESOURCE_EXHAUSTED':
          return { message: 'Gmail rate limited the request. Try again shortly.', code: 'RATE_LIMITED' };
        case 'INVALID_ARGUMENT':
          return { message: 'Gmail rejected the message (invalid recipient or content).', code: 'INVALID_MESSAGE' };
        case 'timeout':
          return { message: 'The Gmail request timed out.', code: 'TIMEOUT' };
        case 'network_error':
          return { message: 'Could not reach the Gmail API.', code: 'NETWORK' };
        default: {
          const parts: string[] = [];
          if (slug && slug !== 'unknown') parts.push(slug);
          if (typeof httpStatus === 'number') parts.push(`HTTP ${httpStatus}`);
          const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';
          return {
            message: `Gmail rejected the request${suffix}.`,
            code: 'GMAIL_ERROR',
          };
        }
      }
    })();

    // Attach Google's own reason text when it added anything useful, so the
    // execution record shows the real cause instead of only the mapped summary.
    const finalMessage = googleDetail
      ? `${message} — ${googleDetail}`
      : message;

    return {
      status: ExecutionStepStatus.FAILED,
      output: {
        nodeId: node.id,
        nodeType: 'GMAIL',
        label: node.label,
        config: safeConfig,
        code,
        status: 'FAILED',
      },
      error: finalMessage,
      branch: null,
    };
  }
}

/**
 * Defence-in-depth sanitizer for the Google-supplied detail string before it
 * lands in a persisted execution record. Mirrors `GmailClient`'s own scrub.
 */
function sanitizeGoogleDetail(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  return raw
    .replace(/ya29\.[A-Za-z0-9._-]+/g, 'ya29.***')
    .replace(/1\/\/[A-Za-z0-9._-]+/g, '1//***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .replace(
      /\b(access_token|refresh_token|id_token|client_secret)\b\s*[=:]\s*[^\s&"']+/gi,
      '$1=***',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}
