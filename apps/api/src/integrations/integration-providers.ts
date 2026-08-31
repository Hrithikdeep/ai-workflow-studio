/**
 * Central registry for the integration providers the API supports.
 *
 * Nothing here talks to the database. It defines, per provider:
 *  - the slug used on the wire and in the (legacy) provider-slug routes
 *  - default display metadata (kept in `Integration.config` for the UI)
 *  - which config keys are SECRET and must be moved into an encrypted
 *    `IntegrationCredential` instead of `Integration.config`
 *
 * Secret key lists intentionally include both the field names the current
 * web form sends (`credential`, `signingSecret`) and the richer canonical
 * names a future UI may send. Any recognised secret key found in an
 * incoming `config` is stripped out, bundled, and encrypted.
 */

export const SUPPORTED_PROVIDERS = [
  'slack',
  'gmail',
  'postgresql',
  'http',
  'webhook',
  'openai',
] as const;

export type IntegrationProvider = (typeof SUPPORTED_PROVIDERS)[number];

export function isSupportedProvider(value: unknown): value is IntegrationProvider {
  return (
    typeof value === 'string' &&
    (SUPPORTED_PROVIDERS as readonly string[]).includes(value)
  );
}

export interface ProviderMetadata {
  name: string;
  category: string;
  description: string;
}

export const DEFAULT_METADATA: Record<IntegrationProvider, ProviderMetadata> = {
  slack: {
    name: 'Slack',
    category: 'Communication',
    description: 'Send messages and notifications to Slack channels.',
  },
  gmail: {
    name: 'Gmail',
    category: 'Communication',
    description: 'Send and manage email messages from workflows.',
  },
  postgresql: {
    name: 'PostgreSQL',
    category: 'Database',
    description: 'Read and write data in PostgreSQL databases.',
  },
  http: {
    name: 'HTTP Request',
    category: 'Developer tools',
    description: 'Connect workflows to any REST API.',
  },
  webhook: {
    name: 'Webhooks',
    category: 'Developer tools',
    description: 'Receive events from external systems.',
  },
  openai: {
    name: 'OpenAI',
    category: 'AI',
    description: 'Connect to the OpenAI API with an API key.',
  },
};

/**
 * Config keys that carry secret material. These are removed from
 * `Integration.config` and stored encrypted in `IntegrationCredential.data`.
 * `credential` / `signingSecret` are the keys today's web form sends.
 */
export const PROVIDER_SECRET_FIELDS: Record<IntegrationProvider, string[]> = {
  http: [
    'credential',
    'apiKey',
    'bearerToken',
    'basicAuthPassword',
    'clientSecret',
  ],
  webhook: ['signingSecret', 'credential'],
  slack: ['credential', 'botToken'],
  gmail: ['credential', 'refreshToken', 'appPassword'],
  postgresql: ['credential', 'password', 'connectionString'],
  openai: ['apiKey'],
};

/** Connection-health values stored on `Integration.status`. */
export const INTEGRATION_STATUS = {
  available: 'available',
  connected: 'connected',
  error: 'error',
} as const;

export type IntegrationStatus =
  (typeof INTEGRATION_STATUS)[keyof typeof INTEGRATION_STATUS];

/** Split an incoming config object into non-secret config + secret payload. */
export function splitProviderConfig(
  provider: IntegrationProvider,
  rawConfig: Record<string, unknown> | null | undefined,
): { config: Record<string, unknown>; secrets: Record<string, string> } {
  const secretKeys = new Set(PROVIDER_SECRET_FIELDS[provider] ?? []);
  const config: Record<string, unknown> = {};
  const secrets: Record<string, string> = {};

  for (const [key, value] of Object.entries(rawConfig ?? {})) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (secretKeys.has(key)) {
      secrets[key] = String(value);
    } else {
      config[key] = value;
    }
  }

  return { config, secrets };
}
