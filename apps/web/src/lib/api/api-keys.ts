import api from './client'

export type ApiKeyMeta = {
  id: string
  name: string
  /** e.g. "awf_ab12••••••" — never the full secret. */
  maskedKey: string
  status: 'Active' | 'Revoked'
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

/** Only returned by `createApiKey` — the plaintext key, shown once. */
export type CreatedApiKey = ApiKeyMeta & { key: string }

export function getApiKeys() {
  return api.get<ApiKeyMeta[]>('/api-keys')
}

export function createApiKey(input: { name: string }) {
  return api.post<CreatedApiKey>('/api-keys', input)
}

export function revokeApiKey(id: string) {
  return api.delete<ApiKeyMeta[]>(`/api-keys/${encodeURIComponent(id)}`)
}

export function revokeAllApiKeys() {
  return api.post<ApiKeyMeta[]>('/api-keys/revoke-all')
}
