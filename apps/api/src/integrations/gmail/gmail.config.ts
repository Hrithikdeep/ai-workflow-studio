/**
 * Google OAuth 2.0 / Gmail configuration.
 *
 * All values come from the environment — nothing is hard-coded. When the
 * OAuth client is not configured, `getGoogleOAuthConfig()` returns null and
 * the Gmail OAuth routes fail safely with a "not configured" message.
 */

export const GMAIL_SCOPES = [
  // Least privilege: send-only Gmail access.
  'https://www.googleapis.com/auth/gmail.send',
  // Identify the connected account (email only) for the connection test + UI.
  'openid',
  'email',
] as const;

export const GOOGLE_ENDPOINTS = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
  gmailSend: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
  revoke: 'https://oauth2.googleapis.com/revoke',
} as const;

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  // Accept either name for the redirect URI env var.
  const redirectUri = (
    process.env.GOOGLE_OAUTH_REDIRECT_URI ?? process.env.GOOGLE_REDIRECT_URI
  )?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

/** Where the browser is sent back to after the OAuth dance completes. */
export function getWebAppUrl(): string {
  return (process.env.WEB_APP_URL?.trim() || 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );
}
