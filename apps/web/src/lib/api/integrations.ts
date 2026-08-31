import api from './client'

/**
 * Typed client for the NestJS Integration API (Step 2).
 *
 * The backend never returns secret material. `config` only ever contains
 * non-secret fields; whether a secret is stored is signalled by
 * `hasCredential`.
 */

export type IntegrationProvider =
  | 'slack'
  | 'gmail'
  | 'postgresql'
  | 'http'
  | 'webhook'
  | 'openai'

export type IntegrationStatus = 'available' | 'connected' | 'error'

/** Non-secret configuration returned by the API. */
export type IntegrationConfig = Record<string, string | number | boolean | null>

export type Integration = {
  id: string
  workspaceId: string
  provider: IntegrationProvider
  name: string
  status: IntegrationStatus
  config: IntegrationConfig
  hasCredential: boolean
  createdAt?: string
  updatedAt?: string
}

/**
 * Config sent to the API. Secret keys (`credential`, `signingSecret`, …)
 * are extracted and encrypted server-side and must ONLY be included when
 * the user actually entered a value.
 */
export type IntegrationConfigInput = Record<string, string>

export type CreateIntegrationInput = {
  provider: IntegrationProvider
  name?: string
  config?: IntegrationConfigInput
}

export type UpdateIntegrationInput = {
  name?: string
  config?: IntegrationConfigInput
}

export type IntegrationTestResultCode =
  | 'OK'
  | 'MISSING_CONFIG'
  | 'MISSING_CREDENTIAL'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'UNREACHABLE'
  | 'BLOCKED'
  | 'TIMEOUT'
  | 'NOT_SUPPORTED_YET'
  | 'PROBE_ERROR'

export type IntegrationTestResult = {
  integrationId: string
  provider: IntegrationProvider
  ok: boolean
  status: IntegrationStatus
  code: IntegrationTestResultCode
  message: string
  detail?: Record<string, unknown>
  checkedAt: string
}

export type DeleteIntegrationResult = {
  id: string
  deleted: true
}

export function getIntegrations() {
  return api.get<Integration[]>('/integrations')
}

export function getIntegration(id: string) {
  return api.get<Integration>(`/integrations/${encodeURIComponent(id)}`)
}

export function createIntegration(input: CreateIntegrationInput) {
  return api.post<Integration>('/integrations', input)
}

export function updateIntegration(id: string, input: UpdateIntegrationInput) {
  return api.patch<Integration>(`/integrations/${encodeURIComponent(id)}`, input)
}

export function deleteIntegration(id: string) {
  return api.delete<DeleteIntegrationResult>(
    `/integrations/${encodeURIComponent(id)}`,
  )
}

export function testIntegration(id: string) {
  return api.post<IntegrationTestResult>(
    `/integrations/${encodeURIComponent(id)}/test`,
    {},
  )
}
