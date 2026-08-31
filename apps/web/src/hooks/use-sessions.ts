'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getSessions,
  revokeAllSessions,
  revokeOtherSessions,
  revokeSession,
} from '@/lib/api/sessions'
import { queryKeys } from '@/lib/api/query-keys'

export function useSessions() {
  return useQuery({
    queryKey: queryKeys.sessions.all,
    queryFn: getSessions,
    staleTime: 15_000,
  })
}

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => revokeOtherSessions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all })
    },
  })
}

export function useRevokeSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => revokeSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all })
    },
  })
}

export function useRevokeAllSessions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => revokeAllSessions(),
    onSettled: () => {
      queryClient.clear()
    },
  })
}
