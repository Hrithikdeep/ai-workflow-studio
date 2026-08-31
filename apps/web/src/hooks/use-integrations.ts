'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  createIntegration,
  deleteIntegration,
  getIntegration,
  getIntegrations,
  testIntegration,
  updateIntegration,
  type CreateIntegrationInput,
  type Integration,
  type UpdateIntegrationInput,
} from '@/lib/api/integrations'
import { queryKeys } from '@/lib/api/query-keys'

export function useIntegrations() {
  return useQuery({
    queryKey: queryKeys.integrations.all,
    queryFn: getIntegrations,
  })
}

export function useIntegration(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.integrations.detail(id ?? ''),
    queryFn: () => getIntegration(id ?? ''),
    enabled: Boolean(id),
  })
}

export function useCreateIntegration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateIntegrationInput) => createIntegration(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all })
    },
  })
}

export function useUpdateIntegration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateIntegrationInput }) =>
      updateIntegration(id, input),
    onSuccess: (data: Integration, variables) => {
      queryClient.setQueryData(
        queryKeys.integrations.detail(variables.id),
        data,
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all })
      queryClient.invalidateQueries({
        queryKey: queryKeys.integrations.detail(variables.id),
      })
    },
  })
}

export function useDeleteIntegration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteIntegration(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({
        queryKey: queryKeys.integrations.detail(id),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all })
    },
  })
}

export function useTestIntegration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => testIntegration(id),
    // A test can change `status`, so refresh both list and detail.
    onSettled: (_data, _error, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all })
      queryClient.invalidateQueries({
        queryKey: queryKeys.integrations.detail(id),
      })
    },
  })
}
