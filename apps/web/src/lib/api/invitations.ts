import api from './client'

export type Invitation = {
  id: string
  email: string
  role: string
  status: string
  createdAt: string
  expiresAt: string
  /** Only present on the create response (no mailer yet). */
  token?: string
}

export function getInvitations() {
  return api.get<Invitation[]>('/invitations')
}

export function createInvitation(input: { email: string; role: string }) {
  return api.post<Invitation>('/invitations', input)
}

export function revokeInvitation(id: string) {
  return api.post<Invitation[]>(
    `/invitations/${encodeURIComponent(id)}/revoke`,
  )
}
