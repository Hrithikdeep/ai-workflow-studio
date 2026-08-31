'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  createWorkflow,
  createWorkflowVersion,
  getWorkflow,
  getWorkflowGraph,
  getWorkflows,
  updateWorkflowGraph,
  publishWorkflowVersion,
} from '@/lib/api/workflows'
import {
  updateWorkflow,
  deleteWorkflow,
  getWorkflowVersions,
} from '@/lib/api/workflows'
import { queryKeys } from '@/lib/api/query-keys'

export function useWorkflows() {
  return useQuery({
    queryKey: queryKeys.workflows.all,
    queryFn: getWorkflows,
    // Operational data: reflect the current set on mount / manual refresh.
    staleTime: 0,
  })
}

export function useWorkflow(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workflows.detail(workflowId ?? ''),
    queryFn: () => getWorkflow(workflowId ?? ''),
    enabled: Boolean(workflowId),
  })
}

export function useWorkflowGraph(versionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workflowGraph.detail(versionId ?? ''),
    queryFn: () => getWorkflowGraph(versionId ?? ''),
    enabled: Boolean(versionId),
  })
}

export function useSaveWorkflowGraph() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ versionId, payload }: { versionId: string; payload: { nodes: any[]; edges: any[] } }) => updateWorkflowGraph(versionId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowGraph.detail(variables.versionId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all })
    },
  })
}

export function usePublishWorkflowVersion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ workflowId, versionId }: { workflowId: string; versionId: string }) =>
      publishWorkflowVersion(workflowId, versionId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.detail(variables.workflowId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.versions(variables.workflowId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowGraph.detail(variables.versionId) })
    },
  })
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflows.all,
      })
    },
  })
}

export function useCreateWorkflowVersion() {
  return useMutation({
    mutationFn: createWorkflowVersion,
  })
}

export function useUpdateWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<{ name: string; description?: string }> }) =>
      updateWorkflow(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.detail(variables.id) })
    },
  })
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteWorkflow(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.detail(id) })
    },
  })
}

export function useWorkflowVersions(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workflows.versions(workflowId ?? ''),
    queryFn: () => getWorkflowVersions(workflowId ?? ''),
    enabled: Boolean(workflowId),
  })
}
