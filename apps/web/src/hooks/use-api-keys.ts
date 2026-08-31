'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createApiKey,
  getApiKeys,
  revokeAllApiKeys,
  revokeApiKey,
  type ApiKeyMeta,
} from '@/lib/api/api-keys'
import { queryKeys } from '@/lib/api/query-keys'

export function useApiKeys() {
  return useQuery({
    queryKey: queryKeys.apiKeys.all,
    queryFn: getApiKeys,
    staleTime: 15_000,
  })
}

export function useCreateApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string }) => createApiKey(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all })
    },
  })
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: (data: ApiKeyMeta[]) => {
      queryClient.setQueryData(queryKeys.apiKeys.all, data)
    },
  })
}

export function useRevokeAllApiKeys() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => revokeAllApiKeys(),
    onSuccess: (data: ApiKeyMeta[]) => {
      queryClient.setQueryData(queryKeys.apiKeys.all, data)
    },
  })
}
