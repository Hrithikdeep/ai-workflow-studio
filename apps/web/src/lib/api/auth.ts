import api from './client'

/**
 * Session/auth client for the NestJS auth endpoints.
 *
 * These calls go through the shared `api` client, which sends
 * `credentials: 'include'`, so the httpOnly `AWF_AT` session cookie issued
 * by `POST /auth/login` and `POST /auth/signup` is stored by the browser
 * and returned on every subsequent API request. The `@Workspace()`
 * decorator on the backend resolves the workspace from that session.
 */

export type SessionUser = {
  id: string
  email: string
  name?: string | null
  workspaceId?: string
}

export type AuthResult = {
  id: string
  email: string
  name?: string | null
  workspaceId?: string
}

export type LoginInput = {
  email: string
  password: string
}

export type SignupInput = {
  email: string
  password: string
  name?: string
}

export function getMe() {
  return api.get<{ user: SessionUser | null }>('/auth/me')
}

export function login(input: LoginInput) {
  return api.post<AuthResult>('/auth/login', input)
}

export function signup(input: SignupInput) {
  return api.post<AuthResult>('/auth/signup', input)
}

export function logout() {
  return api.post<{ ok: true }>('/auth/logout', {})
}

export type UpdateProfileInput = {
  name?: string
  email?: string
}

export function updateMe(input: UpdateProfileInput) {
  return api.patch<{ user: SessionUser }>('/auth/me', input)
}
