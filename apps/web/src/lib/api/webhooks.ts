import api from './client'

/**
 * Client for the workflow webhook-trigger API.
 *
 * `GET /webhooks/:workflowId` and the config routes are workspace-scoped
 * (session cookie). The inbound `POST /webhooks/:workflowId` is called by
 * external systems with the secret header, not from the browser.
 */

export type WebhookConfig = {
  workflowId: string
  /** API path of the inbound endpoint, e.g. `/webhooks/<id>`. */
  path: string
  enabled: boolean
  hasSecret: boolean
  createdAt: string | null
  updatedAt: string | null
}

/** Returned once, only from a deliberate rotate call. */
export type WebhookSecretResponse = WebhookConfig & { secret: string }

export function getWebhook(workflowId: string) {
  return api.get<WebhookConfig>(`/webhooks/${encodeURIComponent(workflowId)}`)
}

export function rotateWebhookSecret(workflowId: string) {
  return api.post<WebhookSecretResponse>(
    `/webhooks/${encodeURIComponent(workflowId)}/rotate`,
  )
}

export function setWebhookEnabled(workflowId: string, enabled: boolean) {
  return api.patch<WebhookConfig>(
    `/webhooks/${encodeURIComponent(workflowId)}`,
    { enabled },
  )
}
