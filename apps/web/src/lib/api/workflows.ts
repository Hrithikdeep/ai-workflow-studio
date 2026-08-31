import api from './client'
import type {
  Workflow,
  WorkflowGraph,
  WorkflowVersion,
} from './types'

export type CreateWorkflowPayload = {
  name: string
  description?: string
}

export function getWorkflows() {
  return api.get<Workflow[]>('/workflows')
}

export function getWorkflow(workflowId: string) {
  return api.get<Workflow>(`/workflows/${workflowId}`)
}

export function getWorkflowGraph(versionId: string) {
  return api.get<WorkflowGraph>(`/workflows/versions/${versionId}/graph`)
}

export function updateWorkflowGraph(versionId: string, payload: { nodes: any[]; edges: any[] }) {
  const normalizedNodes = (payload.nodes ?? []).map((node) => {
    // Accept either a React Flow `position` object or explicit
    // `positionX` / `positionY` numeric fields. Preserve incoming
    // coordinates exactly so positions don't reset to 0 on save.
    const position = node?.position ?? (
      (node?.positionX !== undefined || node?.positionY !== undefined)
        ? { x: Number(node.positionX ?? 0), y: Number(node.positionY ?? 0) }
        : { x: 0, y: 0 }
    )

    return {
      id: node?.id,
      type: node?.type ?? node?.data?.type ?? 'MANUAL_TRIGGER',
      label: node?.data?.label ?? node?.label ?? 'Node',
      positionX: Number(position?.x ?? 0),
      positionY: Number(position?.y ?? 0),
      config: node?.data?.config ?? node?.config ?? {},
    }
  })

  const normalizedEdges = (payload.edges ?? []).map((edge) => ({
    id: edge?.id,
    sourceNodeId: edge?.sourceNodeId ?? edge?.source,
    targetNodeId: edge?.targetNodeId ?? edge?.target,
    sourceHandle: edge?.sourceHandle ?? null,
    targetHandle: edge?.targetHandle ?? null,
  }))

  return api.put<{ success: boolean; versionId: string }>(`/workflows/versions/${versionId}/graph`, {
    nodes: normalizedNodes,
    edges: normalizedEdges,
  })
}

export function publishWorkflowVersion(workflowId: string, versionId: string) {
  return api.post<{ success: boolean; versionId: string }>(`/workflows/${workflowId}/versions/${versionId}/publish`)
}

export function createWorkflow(payload: CreateWorkflowPayload) {
  return api.post<Workflow>('/workflows', payload)
}

export function createWorkflowVersion(workflowId: string) {
  return api.post<WorkflowVersion>(`/workflows/${workflowId}/versions`)
}

export function updateWorkflow(workflowId: string, payload: Partial<CreateWorkflowPayload>) {
  return api.patch<Workflow>(`/workflows/${workflowId}`, payload)
}

export function deleteWorkflow(workflowId: string) {
  return api.delete<void>(`/workflows/${workflowId}`)
}

export function getWorkflowVersions(workflowId: string) {
  return api.get<WorkflowVersion[]>(`/workflows/${workflowId}/versions`)
}
