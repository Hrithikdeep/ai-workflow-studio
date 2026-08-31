import { BadRequestException } from '@nestjs/common';

import { GmailOAuthService } from './gmail-oauth.service';
import { GmailClient, GoogleApiError } from './gmail-client';

const ENV = {
  GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'csecret',
  GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3001/integrations/gmail/oauth/callback',
  WEB_APP_URL: 'http://localhost:3000',
};

function withGoogleEnv(configured: boolean) {
  for (const k of Object.keys(ENV) as (keyof typeof ENV)[]) {
    if (configured) process.env[k] = ENV[k];
    else delete process.env[k];
  }
}

type OAuthStateRow = {
  state: string;
  provider: string;
  workspaceId: string;
  userId: string;
  integrationId: string | null;
  redirectTo: string | null;
  expiresAt: Date;
  usedAt: Date | null;
};

function makeService(opts?: {
  stateRow?: OAuthStateRow | null;
  decrypted?: Record<string, unknown> | null;
  client?: Partial<GmailClient>;
}) {
  const states: Record<string, OAuthStateRow> = {};
  if (opts && 'stateRow' in opts && opts.stateRow) {
    states[opts.stateRow.state] = opts.stateRow;
  }

  const prisma = {
    oAuthState: {
      create: jest.fn(({ data }: { data: OAuthStateRow }) => {
        states[data.state] = { ...data, usedAt: null };
        return states[data.state];
      }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn(({ where, data }: { where: { state: string; usedAt: null; expiresAt: { gt: Date } }; data: { usedAt: Date } }) => {
        const row = states[where.state];
        if (!row || row.usedAt || row.expiresAt <= where.expiresAt.gt) {
          return Promise.resolve({ count: 0 });
        }
        row.usedAt = data.usedAt;
        return Promise.resolve({ count: 1 });
      }),
      findUnique: jest.fn(({ where }: { where: { state: string } }) =>
        Promise.resolve(states[where.state] ?? null),
      ),
    },
    integration: {
      findFirst: jest.fn().mockResolvedValue({ id: 'int-1' }),
      findUnique: jest.fn().mockResolvedValue({ config: {} }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 'int-new' }),
    },
  } as never;

  const upsert = jest.fn().mockResolvedValue({ id: 'cred-1', created: true });
  const credentials = {
    upsertForIntegration: upsert,
    getDecryptedForIntegration: jest
      .fn()
      .mockResolvedValue(opts && 'decrypted' in opts ? opts.decrypted : null),
  } as never;

  const client = Object.assign(new GmailClient(), opts?.client) as GmailClient;

  const service = new GmailOAuthService(prisma, credentials, client);
  return { service, prisma: prisma as never, upsert, client, states };
}

describe('GmailOAuthService', () => {
  const realEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...realEnv };
    jest.restoreAllMocks();
  });

  it('1. start fails safely when OAuth is not configured', async () => {
    withGoogleEnv(false);
    const { service } = makeService();
    await expect(
      service.createAuthorizationUrl({ workspaceId: 'ws-1', userId: 'u-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('2/3. builds a Google URL with a random state, least-privilege scopes, offline access', async () => {
    withGoogleEnv(true);
    const { service, states } = makeService();
    const url = await service.createAuthorizationUrl({
      workspaceId: 'ws-1',
      userId: 'u-1',
      integrationId: 'int-1',
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('scope')).toBe(
      'https://www.googleapis.com/auth/gmail.send openid email',
    );
    const state = u.searchParams.get('state')!;
    expect(state.length).toBeGreaterThanOrEqual(40); // 32 random bytes -> base64url
    // persisted, bound to the workspace/user, with an expiry
    const row = states[state];
    expect(row.workspaceId).toBe('ws-1');
    expect(row.userId).toBe('u-1');
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
    // two starts -> different states
    const url2 = await service.createAuthorizationUrl({ workspaceId: 'ws-1', userId: 'u-1' });
    expect(new URL(url2).searchParams.get('state')).not.toBe(state);
  });

  it('6/4. callback with an unknown state redirects to an error (no throw)', async () => {
    withGoogleEnv(true);
    const { service } = makeService({ stateRow: null });
    const { redirectTo } = await service.handleCallback({ code: 'x', state: 'nope' });
    expect(redirectTo).toContain('gmail=error');
    expect(redirectTo).toContain('reason=invalid_state');
  });

  it('4. expired state is rejected', async () => {
    withGoogleEnv(true);
    const { service } = makeService({
      stateRow: {
        state: 's-exp', provider: 'gmail', workspaceId: 'ws-1', userId: 'u-1',
        integrationId: 'int-1', redirectTo: null,
        expiresAt: new Date(Date.now() - 1000), usedAt: null,
      },
    });
    const { redirectTo } = await service.handleCallback({ code: 'c', state: 's-exp' });
    expect(redirectTo).toContain('reason=invalid_state');
  });

  it('5/7. state is single-use — a reused state is rejected', async () => {
    withGoogleEnv(true);
    const exchangeCode = jest
      .fn()
      .mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', accessTokenExpiresAt: Date.now() + 3600_000, scope: 's' });
    const getProfile = jest.fn().mockResolvedValue({ email: 'user@example.com' });
    const { service } = makeService({
      stateRow: {
        state: 's-1', provider: 'gmail', workspaceId: 'ws-1', userId: 'u-1',
        integrationId: 'int-1', redirectTo: null,
        expiresAt: new Date(Date.now() + 60_000), usedAt: null,
      },
      client: { exchangeCode, getProfile },
    });

    const first = await service.handleCallback({ code: 'c', state: 's-1' });
    expect(first.redirectTo).toContain('gmail=connected');

    const second = await service.handleCallback({ code: 'c', state: 's-1' });
    expect(second.redirectTo).toContain('reason=invalid_state');
    expect(exchangeCode).toHaveBeenCalledTimes(1);
  });

  it('8/9/10. callback exchanges the code and stores ENCRYPTED tokens in the state\'s workspace', async () => {
    withGoogleEnv(true);
    const exchangeCode = jest.fn().mockResolvedValue({
      accessToken: 'ya29.ACCESS', refreshToken: '1//REFRESH',
      accessTokenExpiresAt: Date.now() + 3600_000, scope: 'https://www.googleapis.com/auth/gmail.send openid email',
    });
    const getProfile = jest.fn().mockResolvedValue({ email: 'ops@example.com' });
    const { service, upsert } = makeService({
      stateRow: {
        state: 's-ok', provider: 'gmail', workspaceId: 'ws-STATE', userId: 'u-1',
        integrationId: 'int-1', redirectTo: null,
        expiresAt: new Date(Date.now() + 60_000), usedAt: null,
      },
      client: { exchangeCode, getProfile },
    });

    const { redirectTo } = await service.handleCallback({
      code: 'auth-code',
      state: 's-ok',
    });

    expect(redirectTo).toContain('gmail=connected');
    // stored via IntegrationCredentialsService (which encrypts) — not raw
    expect(upsert).toHaveBeenCalledTimes(1);
    const call = upsert.mock.calls[0][0];
    expect(call.workspaceId).toBe('ws-STATE'); // workspace ONLY from the state
    expect(call.provider).toBe('gmail');
    expect(call.secrets.refreshToken).toBe('1//REFRESH');
    expect(call.secrets.accessToken).toBe('ya29.ACCESS');
  });

  it('callback with no refresh_token does not store a dead credential', async () => {
    withGoogleEnv(true);
    const { service, upsert } = makeService({
      stateRow: {
        state: 's-nr', provider: 'gmail', workspaceId: 'ws-1', userId: 'u-1',
        integrationId: 'int-1', redirectTo: null,
        expiresAt: new Date(Date.now() + 60_000), usedAt: null,
      },
      client: {
        exchangeCode: jest.fn().mockResolvedValue({ accessToken: 'at', accessTokenExpiresAt: Date.now() + 3600_000 }),
      },
    });
    const { redirectTo } = await service.handleCallback({ code: 'c', state: 's-nr' });
    expect(redirectTo).toContain('reason=no_refresh_token');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('15. getFreshAccessToken refreshes + persists when the access token is expired', async () => {
    withGoogleEnv(true);
    const refreshAccessToken = jest.fn().mockResolvedValue({
      accessToken: 'ya29.NEW', accessTokenExpiresAt: Date.now() + 3600_000, scope: 's',
    });
    const { service, upsert } = makeService({
      decrypted: {
        refreshToken: '1//REFRESH',
        accessToken: 'ya29.OLD',
        accessTokenExpiresAt: Date.now() - 1000, // expired
      },
      client: { refreshAccessToken },
    });

    const { accessToken } = await service.getFreshAccessToken('ws-1', 'int-1', 'Gmail');
    expect(accessToken).toBe('ya29.NEW');
    expect(refreshAccessToken).toHaveBeenCalledWith(expect.anything(), '1//REFRESH');
    expect(upsert).toHaveBeenCalled();
    // refresh token preserved
    expect(upsert.mock.calls[0][0].secrets.refreshToken).toBe('1//REFRESH');
  });

  it('getFreshAccessToken reuses a still-valid cached access token (no refresh)', async () => {
    withGoogleEnv(true);
    const refreshAccessToken = jest.fn();
    const { service } = makeService({
      decrypted: {
        refreshToken: '1//R', accessToken: 'ya29.CACHED',
        accessTokenExpiresAt: Date.now() + 10 * 60_000,
      },
      client: { refreshAccessToken },
    });
    const { accessToken } = await service.getFreshAccessToken('ws-1', 'int-1', 'Gmail');
    expect(accessToken).toBe('ya29.CACHED');
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('16. revoked refresh token surfaces AUTH_REVOKED, integration marked error', async () => {
    withGoogleEnv(true);
    const refreshAccessToken = jest
      .fn()
      .mockRejectedValue(new GoogleApiError('invalid_grant', 400, 'bad'));
    const { service, prisma } = makeService({
      decrypted: { refreshToken: '1//DEAD', accessTokenExpiresAt: 0 },
      client: { refreshAccessToken },
    });
    const res = await service.testConnection('ws-1', 'int-1', 'Gmail');
    expect(res.ok).toBe(false);
    expect(res.code).toBe('AUTH_REVOKED');
    expect(
      (prisma as unknown as { integration: { updateMany: jest.Mock } }).integration.updateMany,
    ).toHaveBeenCalled();
  });

  it('13. testConnection success maps to OK with the account email (grant includes gmail.send)', async () => {
    withGoogleEnv(true);
    const { service } = makeService({
      decrypted: {
        refreshToken: '1//R', accessToken: 'ya29.OK',
        accessTokenExpiresAt: Date.now() + 10 * 60_000,
        scope: 'https://www.googleapis.com/auth/gmail.send openid email',
      },
      client: { getProfile: jest.fn().mockResolvedValue({ email: 'me@example.com' }) },
    });
    const res = await service.testConnection('ws-1', 'int-1', 'Gmail');
    expect(res.ok).toBe(true);
    expect(res.code).toBe('OK');
    expect(res.detail?.account).toBe('me@example.com');
  });

  it('13b. testConnection reports INSUFFICIENT_SCOPE when the grant cannot send mail', async () => {
    withGoogleEnv(true);
    const { service, prisma } = makeService({
      decrypted: {
        refreshToken: '1//R', accessToken: 'ya29.OK',
        accessTokenExpiresAt: Date.now() + 10 * 60_000,
        // profile resolves, but no gmail.send in the grant
        scope: 'https://www.googleapis.com/auth/userinfo.email openid',
      },
      client: { getProfile: jest.fn().mockResolvedValue({ email: 'me@example.com' }) },
    });
    const res = await service.testConnection('ws-1', 'int-1', 'Gmail');
    expect(res.ok).toBe(false);
    expect(res.code).toBe('INSUFFICIENT_SCOPE');
    expect(res.detail?.account).toBe('me@example.com');
    expect(res.detail?.missingScope).toBe(
      'https://www.googleapis.com/auth/gmail.send',
    );
    expect(
      (prisma as unknown as { integration: { updateMany: jest.Mock } }).integration.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'error' } }),
    );
  });

  it('14. testConnection with no stored credential -> MISSING_CREDENTIAL', async () => {
    withGoogleEnv(true);
    const { service } = makeService({ decrypted: null });
    const res = await service.testConnection('ws-1', 'int-1', 'Gmail');
    expect(res.ok).toBe(false);
    expect(res.code).toBe('MISSING_CREDENTIAL');
  });

  it('testConnection when unconfigured -> NOT_CONFIGURED (no crash)', async () => {
    withGoogleEnv(false);
    const { service } = makeService();
    const res = await service.testConnection('ws-1', 'int-1', 'Gmail');
    expect(res.code).toBe('NOT_CONFIGURED');
  });

  it('12/24. no token value appears in any test/callback result', async () => {
    withGoogleEnv(true);
    const { service } = makeService({
      decrypted: {
        refreshToken: '1//SECRET_REFRESH', accessToken: 'ya29.SECRET_ACCESS',
        accessTokenExpiresAt: Date.now() + 10 * 60_000,
      },
      client: { getProfile: jest.fn().mockResolvedValue({ email: 'x@example.com' }) },
    });
    const res = await service.testConnection('ws-1', 'int-1', 'Gmail');
    const s = JSON.stringify(res);
    expect(s).not.toContain('SECRET_REFRESH');
    expect(s).not.toContain('SECRET_ACCESS');
    expect(s).not.toContain('1//');
    expect(s).not.toContain('ya29');
  });
});
