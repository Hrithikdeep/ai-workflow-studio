import { Injectable } from '@nestjs/common';

import {
  GMAIL_SCOPES,
  GOOGLE_ENDPOINTS,
  type GoogleOAuthConfig,
} from './gmail.config';

const HTTP_TIMEOUT_MS = 10_000;

/** A well-known Google OAuth error slug (never contains a token). */
export class GoogleApiError extends Error {
  constructor(
    readonly slug: string,
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

export interface TokenBundle {
  accessToken: string;
  /** Present on the first exchange; Google omits it on refresh. */
  refreshToken?: string;
  /** Epoch ms. */
  accessTokenExpiresAt: number;
  scope?: string;
  tokenType?: string;
}

export interface GmailProfile {
  email: string;
}

export interface GmailSendResult {
  id: string;
  threadId?: string;
}

/**
 * Thin HTTP client for Google's OAuth + Gmail-send endpoints.
 *
 * No NestJS service dependencies, so it is trivially mockable. It never
 * logs or returns anything beyond what its typed results expose — in
 * particular it never echoes an access/refresh token or the client secret.
 */
@Injectable()
export class GmailClient {
  buildAuthorizationUrl(
    cfg: GoogleOAuthConfig,
    state: string,
  ): string {
    const url = new URL(GOOGLE_ENDPOINTS.auth);
    url.searchParams.set('client_id', cfg.clientId);
    url.searchParams.set('redirect_uri', cfg.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GMAIL_SCOPES.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(
    cfg: GoogleOAuthConfig,
    code: string,
  ): Promise<TokenBundle> {
    const body = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: cfg.redirectUri,
    });
    return this.tokenRequest(body);
  }

  async refreshAccessToken(
    cfg: GoogleOAuthConfig,
    refreshToken: string,
  ): Promise<TokenBundle> {
    const body = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    return this.tokenRequest(body);
  }

  async getProfile(accessToken: string): Promise<GmailProfile> {
    const res = await this.fetchWithTimeout(GOOGLE_ENDPOINTS.userinfo, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.json().catch(() => ({}))) as {
      email?: string;
      error?: string;
    };
    if (!res.ok || !json.email) {
      throw new GoogleApiError(
        json.error || 'userinfo_failed',
        res.status,
        'Could not read the Google account profile.',
      );
    }
    return { email: json.email };
  }

  async sendMessage(
    accessToken: string,
    rawBase64Url: string,
  ): Promise<GmailSendResult> {
    const res = await this.fetchWithTimeout(GOOGLE_ENDPOINTS.gmailSend, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ raw: rawBase64Url }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      threadId?: string;
      error?: { status?: string; message?: string; code?: number };
    };
    if (!res.ok || !json.id) {
      const slug =
        json.error?.status ||
        (res.status === 401
          ? 'UNAUTHENTICATED'
          : res.status === 403
            ? 'PERMISSION_DENIED'
            : res.status === 429
              ? 'RESOURCE_EXHAUSTED'
              : 'gmail_send_failed');
      throw new GoogleApiError(slug, res.status, 'Gmail rejected the message.');
    }
    return { id: json.id, threadId: json.threadId };
  }

  /**
   * Build an RFC 2822 message and return it base64url-encoded for the
   * Gmail API `raw` field.
   */
  buildRawMessage(params: {
    to: string;
    subject: string;
    body: string;
    from?: string;
  }): string {
    const headers = [
      `To: ${sanitizeHeader(params.to)}`,
      `Subject: ${encodeSubject(params.subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
    ];
    if (params.from) {
      headers.unshift(`From: ${sanitizeHeader(params.from)}`);
    }
    const mime = `${headers.join('\r\n')}\r\n\r\n${params.body}`;
    return Buffer.from(mime, 'utf8').toString('base64url');
  }

  private async tokenRequest(body: URLSearchParams): Promise<TokenBundle> {
    const res = await this.fetchWithTimeout(GOOGLE_ENDPOINTS.token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) {
      throw new GoogleApiError(
        json.error || 'token_request_failed',
        res.status,
        'Google rejected the authorization.',
      );
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      accessTokenExpiresAt:
        Date.now() + Math.max(60, json.expires_in ?? 3600) * 1000,
      scope: json.scope,
      tokenType: json.token_type,
    };
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      throw new GoogleApiError(
        name === 'TimeoutError' || name === 'AbortError'
          ? 'timeout'
          : 'network_error',
        0,
        name === 'TimeoutError'
          ? 'The request to Google timed out.'
          : 'Could not reach Google.',
      );
    }
  }
}

/** Strip CR/LF so a value can't inject extra headers. */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/** RFC 2047-encode a subject only if it contains non-ASCII. */
function encodeSubject(subject: string): string {
  const clean = sanitizeHeader(subject);
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(clean)) {
    return clean;
  }
  return `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}
