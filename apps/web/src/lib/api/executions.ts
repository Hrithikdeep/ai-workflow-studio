import api from './client'
import type { Execution } from './types'

export type ExecutionQueryParams = {
  status?: string
  workflowId?: string
  workflowVersionId?: string
  skip?: number
  take?: number
}

export type RunExecutionPayload = {
  workflowId: string
  workflowVersionId?: string
  triggerType?: string
  input?: Record<string, unknown>
}

export type ExecutionStats = {
  total: number
  running: number
  completed: number
  succeeded: number
  failed: number
  cancelled: number
  pending: number
}

export function getExecutions(params?: ExecutionQueryParams) {
  return api.get<Execution[]>('/executions', { params })
}

/** Status-aggregated execution counts, computed in the DB (not paginated). */
export function getExecutionStats() {
  return api.get<ExecutionStats>('/executions/stats')
}

export function runExecution(payload: RunExecutionPayload) {
  return api.post<Execution>('/executions/run', payload)
}

export function getExecution(executionId: string) {
  return api.get<Execution>(`/executions/${executionId}`)
}

export function deleteExecution(executionId: string) {
  return api.delete<{ id: string; deleted: true }>(
    `/executions/${encodeURIComponent(executionId)}`,
  )
}
