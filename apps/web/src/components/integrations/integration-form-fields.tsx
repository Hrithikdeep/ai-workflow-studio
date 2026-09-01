'use client'

import type { IntegrationProvider } from '@/lib/api/integrations'

/**
 * Reusable provider-specific field set for the create and edit flows.
 *
 * Field keys match the Step 2 backend DTOs exactly. Secret keys
 * (`credential`, `signingSecret`) are rendered as password inputs and are
 * the caller's responsibility to only submit when non-empty (see
 * `collectDirtySecrets`).
 */

type FieldKind = 'text' | 'url' | 'email' | 'number' | 'password' | 'select'

type FieldDef = {
  key: string
  label: string
  kind: FieldKind
  placeholder?: string
  options?: string[]
  secret?: boolean
  help?: string
}

const PROVIDER_FIELDS: Record<IntegrationProvider, FieldDef[]> = {
  slack: [
    { key: 'workspace', label: 'Workspace', kind: 'text', placeholder: 'Acme' },
    { key: 'channel', label: 'Default channel', kind: 'text', placeholder: '#alerts' },
    {
      key: 'credential',
      label: 'Bot token',
      kind: 'password',
      secret: true,
      placeholder: 'xoxb-…',
      help: 'Slack bot token used to post messages.',
    },
  ],
  gmail: [
    {
      key: 'senderName',
      label: 'Sender name',
      kind: 'text',
      placeholder: 'Acme Ops',
      help: 'After creating this integration, connect it with Google (OAuth) from the integration page. No password is stored — access is granted through Google.',
    },
  ],
  postgresql: [
    { key: 'host', label: 'Host', kind: 'text', placeholder: 'db.example.com' },
    { key: 'port', label: 'Port', kind: 'number', placeholder: '5432' },
    { key: 'database', label: 'Database', kind: 'text', placeholder: 'app' },
    { key: 'username', label: 'Username', kind: 'text', placeholder: 'svc' },
    {
      key: 'ssl',
      label: 'SSL mode',
      kind: 'select',
      options: ['', 'disable', 'prefer', 'require', 'no-verify'],
      help: 'Use "no-verify" for TLS with a self-signed certificate (e.g. a managed Postgres behind a proxy).',
    },
    {
      key: 'credential',
      label: 'Password',
      kind: 'password',
      secret: true,
      help: 'Database password. A full connection string can be pasted here instead.',
    },
  ],
  http: [
    { key: 'baseUrl', label: 'Base URL', kind: 'url', placeholder: 'https://api.example.com' },
    {
      key: 'authType',
      label: 'Authentication',
      kind: 'select',
      options: ['None', 'Basic', 'Bearer Token', 'API Key'],
    },
    {
      key: 'credential',
      label: 'Credential / token',
      kind: 'password',
      secret: true,
      help: 'Sent according to the selected authentication type.',
    },
  ],
  webhook: [
    { key: 'endpointName', label: 'Endpoint name', kind: 'text', placeholder: 'orders' },
    {
      key: 'signingSecret',
      label: 'Signing secret',
      kind: 'password',
      secret: true,
      help: 'Used to verify inbound webhook signatures.',
    },
  ],
  openai: [
    {
      key: 'apiKey',
      label: 'API key',
      kind: 'password',
      secret: true,
      placeholder: 'sk-…',
      help: 'OpenAI API key. Encrypted at rest and never shown again after saving.',
    },
  ],
}

export const SECRET_FIELD_KEYS = new Set(['credential', 'signingSecret', 'apiKey'])

/** Keys the API treats as non-secret config for a provider. */
export function nonSecretKeys(provider: IntegrationProvider): string[] {
  return PROVIDER_FIELDS[provider]
    .filter((f) => !f.secret)
    .map((f) => f.key)
}

/**
 * From a form state, return only the secret entries the user actually
 * typed. Empty secret fields are dropped so an existing credential is
 * never overwritten (matches Step 2 PATCH behaviour).
 */
export function collectDirtySecrets(
  values: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of SECRET_FIELD_KEYS) {
    const v = values[key]
    if (typeof v === 'string' && v.trim() !== '') {
      out[key] = v
    }
  }
  return out
}

type IntegrationFormFieldsProps = {
  provider: IntegrationProvider
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  mode: 'create' | 'edit'
  hasCredential?: boolean
  disabled?: boolean
}

export function IntegrationFormFields({
  provider,
  values,
  onChange,
  mode,
  hasCredential = false,
  disabled = false,
}: IntegrationFormFieldsProps) {
  const fields = PROVIDER_FIELDS[provider]
  const inputClass =
    'h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[11px] text-slate-700 outline-none focus:border-blue-400 disabled:cursor-not-allowed disabled:bg-slate-50'

  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const value = values[field.key] ?? ''
        const isConfiguredSecret =
          field.secret && mode === 'edit' && hasCredential

        return (
          <div key={field.key} className="grid gap-1.5">
            <label className="text-[10px] font-medium text-slate-500">
              {field.label}
              {isConfiguredSecret && (
                <span className="ml-2 rounded-sm bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600">
                  Credential configured
                </span>
              )}
            </label>

            {field.kind === 'select' ? (
              <select
                className={inputClass}
                value={value || (field.options?.[0] ?? '')}
                disabled={disabled}
                onChange={(e) => onChange(field.key, e.target.value)}
              >
                {(field.options ?? []).map((opt) => (
                  <option key={opt || 'none'} value={opt}>
                    {opt === '' ? 'Default' : opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={inputClass}
                type={
                  field.kind === 'number'
                    ? 'number'
                    : field.kind === 'password'
                      ? 'password'
                      : field.kind === 'email'
                        ? 'email'
                        : field.kind === 'url'
                          ? 'url'
                          : 'text'
                }
                autoComplete={field.secret ? 'new-password' : 'off'}
                value={value}
                disabled={disabled}
                placeholder={
                  isConfiguredSecret
                    ? 'Leave blank to keep the stored credential'
                    : field.placeholder
                }
                onChange={(e) => onChange(field.key, e.target.value)}
              />
            )}

            {field.help && (
              <p className="text-[9px] leading-4 text-slate-400">{field.help}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
