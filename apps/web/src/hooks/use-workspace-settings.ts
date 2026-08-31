'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
  type UpdateWorkspaceInput,
} from '@/lib/api/workspace'
import { queryKeys } from '@/lib/api/query-keys'

export function useWorkspaceSettings() {
  return useQuery({
    queryKey: queryKeys.workspace.settings,
    queryFn: getWorkspaceSettings,
    staleTime: 30_000,
  })
}

export function useUpdateWorkspaceSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateWorkspaceInput) => updateWorkspaceSettings(input),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.workspace.settings, data)
    },
  })
}
