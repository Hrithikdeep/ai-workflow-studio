import api from './client'

export type AuthSession = {
  id: string
  createdAt: string
  expiresAt: string | null
  current: boolean
}

export function getSessions() {
  return api.get<AuthSession[]>('/auth/sessions')
}

export function revokeOtherSessions() {
  return api.delete<{ revoked: number }>('/auth/sessions/others')
}

export function revokeSession(id: string) {
  return api.delete<{ revoked: number }>(
    `/auth/sessions/${encodeURIComponent(id)}`,
  )
}

export function revokeAllSessions() {
  return api.delete<{ revoked: number }>('/auth/sessions/all')
}
