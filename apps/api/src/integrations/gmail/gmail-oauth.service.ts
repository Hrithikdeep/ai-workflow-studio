import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationCredentialsService } from '../integration-credentials.service';
import { DEFAULT_METADATA, INTEGRATION_STATUS } from '../integration-providers';
import { GmailClient, GoogleApiError, type TokenBundle } from './gmail-client';
import {
  GMAIL_SCOPES,
  getGoogleOAuthConfig,
  getWebAppUrl,
} from './gmail.config';

const STATE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_SKEW_MS = 60 * 1000;
/** The Gmail scope a workflow Gmail node needs to actually send mail. */
const REQUIRED_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

/** Stored (encrypted) shape for a Gmail credential. */
interface GmailSecrets {
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  scope?: string;
  [k: string]: unknown;
}

export interface GmailTestResult {
  ok: boolean;
  code:
    | 'OK'
    | 'NOT_CONFIGURED'
    | 'MISSING_CREDENTIAL'
    | 'AUTH_REVOKED'
    | 'INSUFFICIENT_SCOPE'
    | 'TIMEOUT'
    | 'UNREACHABLE'
    | 'PROBE_ERROR';
  message: string;
  detail?: Record<string, unknown>;
}

@Injectable()
export class GmailOAuthService {
  private readonly logger = new Logger(GmailOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: IntegrationCredentialsService,
    private readonly gmail: GmailClient,
  ) {}

  isConfigured(): boolean {
    return getGoogleOAuthConfig() !== null;
  }

  // ==========================================================================
  // 1. START — build the Google consent URL, persist a bound single-use state
  // ==========================================================================
  async createAuthorizationUrl(params: {
    workspaceId: string;
    userId: string;
    integrationId?: string;
    redirectTo?: string;
  }): Promise<string> {
    const cfg = getGoogleOAuthConfig();
    if (!cfg) {
      throw new BadRequestException(
        'Gmail OAuth is not configured on this server.',
      );
    }

    // Opportunistic cleanup of expired states.
    await this.prisma.oAuthState
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => undefined);

    const state = randomBytes(32).toString('base64url');
    await this.prisma.oAuthState.create({
      data: {
        state,
        provider: 'gmail',
        workspaceId: params.workspaceId,
        userId: params.userId,
        integrationId: params.integrationId ?? null,
        redirectTo: safeRelativePath(params.redirectTo) ?? null,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });

    return this.gmail.buildAuthorizationUrl(cfg, state);
  }

  // ==========================================================================
  // 2. CALLBACK — validate state, exchange the code, store encrypted tokens
  // ==========================================================================
  async handleCallback(params: {
    code?: string;
    state?: string;
    error?: string;
  }): Promise<{ redirectTo: string }> {
    const cfg = getGoogleOAuthConfig();
    if (!cfg) {
      return { redirectTo: this.failUrl(undefined, 'not_configured') };
    }

    if (params.error) {
      this.logger.warn(`Gmail OAuth callback: consent declined (${params.error})`);
      return { redirectTo: this.failUrl(undefined, 'access_denied') };
    }
    if (!params.state || !params.code) {
      return { redirectTo: this.failUrl(undefined, 'invalid_request') };
    }

    // Single-use: consume the row atomically. `updateMany` on the unused,
    // unexpired state; count 0 => invalid / expired / already used.
    const now = new Date();
    const consumed = await this.prisma.oAuthState.updateMany({
      where: {
        state: params.state,
        provider: 'gmail',
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });
    if (consumed.count === 0) {
      this.logger.warn('Gmail OAuth callback: invalid / expired / reused state');
      return { redirectTo: this.failUrl(undefined, 'invalid_state') };
    }
    const pending = await this.prisma.oAuthState.findUnique({
      where: { state: params.state },
    });
    if (!pending) {
      return { redirectTo: this.failUrl(undefined, 'invalid_state') };
    }

    const workspaceId = pending.workspaceId; // <- workspace from the state only
    let integrationId = pending.integrationId ?? undefined;

    try {
      const tokens = await this.gmail.exchangeCode(cfg, params.code);
      if (!tokens.refreshToken) {
        // Google only returns a refresh token with prompt=consent + offline;
        // treat its absence as a failure so we never store a dead credential.
        this.logger.warn('Gmail OAuth: no refresh_token in token response');
        return { redirectTo: this.failUrl(pending.redirectTo, 'no_refresh_token') };
      }

      const profile = await this.gmail.getProfile(tokens.accessToken);

      // Resolve / create the Integration row for this workspace.
      integrationId = await this.ensureIntegration(
        workspaceId,
        integrationId,
        profile.email,
      );

      await this.persistTokens(workspaceId, integrationId, tokens);
      await this.prisma.integration.update({
        where: { id: integrationId },
        data: { status: INTEGRATION_STATUS.connected },
      });

      this.logger.log(
        `Gmail connected for workspace ${workspaceId} (integration ${integrationId})`,
      );
      return {
        redirectTo: this.successUrl(pending.redirectTo, integrationId),
      };
    } catch (error) {
      const slug =
        error instanceof GoogleApiError ? error.slug : 'exchange_failed';
      this.logger.warn(`Gmail OAuth callback failed: ${slug}`);
      return { redirectTo: this.failUrl(pending.redirectTo, 'exchange_failed') };
    }
  }

  // ==========================================================================
  // 3. FRESH CREDENTIAL — refresh + persist; used by executor and probe
  // ==========================================================================
  async getFreshAccessToken(
    workspaceId: string,
    integrationId: string,
    integrationName: string,
  ): Promise<{ accessToken: string; scope?: string }> {
    const cfg = getGoogleOAuthConfig();
    if (!cfg) {
      throw new GoogleApiError('not_configured', 0, 'Gmail OAuth not configured.');
    }

    const secrets = (await this.credentials.getDecryptedForIntegration(
      workspaceId,
      integrationId,
    )) as GmailSecrets | null;

    const refreshToken = firstString(secrets?.refreshToken);
    if (!refreshToken) {
      throw new GoogleApiError(
        'missing_credential',
        0,
        'This Gmail integration is not connected.',
      );
    }

    const accessToken = firstString(secrets?.accessToken);
    const expiresAt = Number(secrets?.accessTokenExpiresAt ?? 0);
    if (accessToken && expiresAt - ACCESS_TOKEN_SKEW_MS > Date.now()) {
      return { accessToken, scope: firstString(secrets?.scope) };
    }

    const refreshed = await this.gmail.refreshAccessToken(cfg, refreshToken);
    await this.persistTokens(workspaceId, integrationId, {
      ...refreshed,
      // Google omits refresh_token on refresh — keep the existing one.
      refreshToken: refreshed.refreshToken ?? refreshToken,
    }, integrationName);

    return { accessToken: refreshed.accessToken, scope: refreshed.scope };
  }

  // ==========================================================================
  // 4. CONNECTION TEST — real Google call with the stored credential
  // ==========================================================================
  async testConnection(
    workspaceId: string,
    integrationId: string,
    integrationName: string,
  ): Promise<GmailTestResult> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        code: 'NOT_CONFIGURED',
        message: 'Gmail OAuth is not configured on this server.',
      };
    }

    let accessToken: string;
    let grantedScope: string | undefined;
    try {
      ({ accessToken, scope: grantedScope } = await this.getFreshAccessToken(
        workspaceId,
        integrationId,
        integrationName,
      ));
    } catch (error) {
      return this.mapTestError(error, workspaceId, integrationId);
    }

    try {
      const profile = await this.gmail.getProfile(accessToken);
      await this.mergeIntegrationConfig(integrationId, { account: profile.email });

      // A profile read only proves the `email` scope. Sending mail from a
      // workflow node needs `gmail.send` — if the stored grant lacks it the
      // integration is NOT ready, even though the account resolves. Report
      // that honestly instead of showing a green "Connected".
      if (!scopeGrantsSend(grantedScope)) {
        await this.prisma.integration
          .updateMany({
            where: { id: integrationId, workspaceId },
            data: { status: INTEGRATION_STATUS.error },
          })
          .catch(() => undefined);
        return {
          ok: false,
          code: 'INSUFFICIENT_SCOPE',
          message:
            `Signed in as ${profile.email}, but this authorization cannot send email. ` +
            'Reconnect Gmail and approve the "Send email on your behalf" permission.',
          detail: { account: profile.email, missingScope: REQUIRED_SEND_SCOPE },
        };
      }

      await this.prisma.integration
        .updateMany({
          where: { id: integrationId, workspaceId },
          data: { status: INTEGRATION_STATUS.connected },
        })
        .catch(() => undefined);
      return {
        ok: true,
        code: 'OK',
        message: `Connected as ${profile.email}. Ready to send email.`,
        detail: { account: profile.email },
      };
    } catch (error) {
      return this.mapTestError(error, workspaceId, integrationId);
    }
  }

  // ==========================================================================
  // helpers
  // ==========================================================================

  private async ensureIntegration(
    workspaceId: string,
    integrationId: string | undefined,
    account: string,
  ): Promise<string> {
    if (integrationId) {
      const row = await this.prisma.integration.findFirst({
        where: { id: integrationId, workspaceId, provider: 'gmail' },
        select: { id: true },
      });
      if (!row) {
        throw new NotFoundException('Integration not found');
      }
      await this.mergeIntegrationConfig(integrationId, { account });
      return integrationId;
    }

    // Reuse an existing gmail integration for this workspace, else create one.
    const existing = await this.prisma.integration.findFirst({
      where: { workspaceId, provider: 'gmail' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (existing) {
      await this.mergeIntegrationConfig(existing.id, { account });
      return existing.id;
    }

    const meta = DEFAULT_METADATA.gmail;
    const created = await this.prisma.integration.create({
      data: {
        workspaceId,
        provider: 'gmail',
        name: meta.name,
        status: INTEGRATION_STATUS.available,
        config: {
          category: meta.category,
          description: meta.description,
          account,
        } as never,
      },
      select: { id: true },
    });
    return created.id;
  }

  private async mergeIntegrationConfig(
    integrationId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const row = await this.prisma.integration.findUnique({
      where: { id: integrationId },
      select: { config: true },
    });
    const current =
      row?.config && typeof row.config === 'object' && !Array.isArray(row.config)
        ? (row.config as Record<string, unknown>)
        : {};
    await this.prisma.integration.update({
      where: { id: integrationId },
      data: { config: { ...current, ...patch } as never },
    });
  }

  private async persistTokens(
    workspaceId: string,
    integrationId: string,
    tokens: TokenBundle,
    integrationName = DEFAULT_METADATA.gmail.name,
  ): Promise<void> {
    const secrets: Record<string, string> = {
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: String(tokens.accessTokenExpiresAt),
    };
    if (tokens.refreshToken) secrets.refreshToken = tokens.refreshToken;
    if (tokens.scope) secrets.scope = tokens.scope;

    await this.credentials.upsertForIntegration({
      workspaceId,
      integrationId,
      provider: 'gmail',
      name: integrationName,
      secrets,
    });
  }

  private mapTestError(
    error: unknown,
    workspaceId: string,
    integrationId: string,
  ): GmailTestResult {
    const slug = error instanceof GoogleApiError ? error.slug : 'unknown';
    void this.prisma.integration
      .updateMany({
        where: { id: integrationId, workspaceId },
        data: { status: INTEGRATION_STATUS.error },
      })
      .catch(() => undefined);

    switch (slug) {
      case 'missing_credential':
        return {
          ok: false,
          code: 'MISSING_CREDENTIAL',
          message: 'Connect this Gmail integration with Google first.',
        };
      case 'invalid_grant':
        return {
          ok: false,
          code: 'AUTH_REVOKED',
          message:
            'Google authorization is no longer valid. Reconnect this Gmail integration.',
        };
      case 'PERMISSION_DENIED':
      case 'insufficient_scope':
        return {
          ok: false,
          code: 'INSUFFICIENT_SCOPE',
          message: 'The Google authorization is missing a required permission.',
        };
      case 'timeout':
        return { ok: false, code: 'TIMEOUT', message: 'Google did not respond in time.' };
      case 'network_error':
        return { ok: false, code: 'UNREACHABLE', message: 'Could not reach Google.' };
      default:
        return {
          ok: false,
          code: 'PROBE_ERROR',
          message: 'The Gmail connection test could not be completed.',
        };
    }
  }

  private successUrl(redirectTo: string | null, integrationId: string): string {
    const base = redirectTo
      ? `${getWebAppUrl()}${redirectTo}`
      : `${getWebAppUrl()}/integrations/${integrationId}`;
    return appendQuery(base, { gmail: 'connected', integrationId });
  }

  private failUrl(redirectTo: string | null | undefined, reason: string): string {
    const base = redirectTo
      ? `${getWebAppUrl()}${redirectTo}`
      : `${getWebAppUrl()}/integrations`;
    return appendQuery(base, { gmail: 'error', reason });
  }
}

function firstString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/**
 * True only when the OAuth grant provably includes Gmail send access.
 * A space-delimited scope string is what Google returns from both the
 * code exchange and every refresh. An empty/unknown scope is treated as
 * "not proven" so the connection test never claims send-readiness it
 * cannot back up.
 */
function scopeGrantsSend(scope: string | undefined): boolean {
  if (!scope) return false;
  return scope.split(/\s+/).includes(REQUIRED_SEND_SCOPE);
}

/** Only allow same-origin relative paths as a post-OAuth redirect target. */
function safeRelativePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith('/') || value.startsWith('//')) return undefined;
  return value.slice(0, 200);
}

function appendQuery(url: string, params: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export const __gmailScopesForTest = GMAIL_SCOPES;
