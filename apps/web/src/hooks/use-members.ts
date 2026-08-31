'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getWorkspaceMembers,
  removeMember,
  updateMemberRole,
  type WorkspaceMember,
  type WorkspaceRole,
} from '@/lib/api/workspace'
import { queryKeys } from '@/lib/api/query-keys'

export function useMembers() {
  return useQuery({
    queryKey: queryKeys.workspace.members,
    queryFn: getWorkspaceMembers,
    staleTime: 15_000,
  })
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: WorkspaceRole }) =>
      updateMemberRole(userId, role),
    onSuccess: (data: WorkspaceMember[]) => {
      queryClient.setQueryData(queryKeys.workspace.members, data)
    },
  })
}

export function useRemoveMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => removeMember(userId),
    onSuccess: (data: WorkspaceMember[]) => {
      queryClient.setQueryData(queryKeys.workspace.members, data)
    },
  })
}
