'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createInvitation,
  getInvitations,
  revokeInvitation,
  type Invitation,
} from '@/lib/api/invitations'
import { queryKeys } from '@/lib/api/query-keys'

export function useInvitations() {
  return useQuery({
    queryKey: queryKeys.invitations.all,
    queryFn: getInvitations,
    staleTime: 15_000,
  })
}

export function useCreateInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; role: string }) =>
      createInvitation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all })
    },
  })
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => revokeInvitation(id),
    onSuccess: (data: Invitation[]) => {
      queryClient.setQueryData(queryKeys.invitations.all, data)
    },
  })
}
