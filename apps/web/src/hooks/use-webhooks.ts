'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  getWebhook,
  rotateWebhookSecret,
  setWebhookEnabled,
} from '@/lib/api/webhooks'
import { queryKeys } from '@/lib/api/query-keys'

export function useWebhook(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.webhooks.detail(workflowId ?? ''),
    queryFn: () => getWebhook(workflowId ?? ''),
    enabled: Boolean(workflowId),
  })
}

export function useRotateWebhookSecret() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (workflowId: string) => rotateWebhookSecret(workflowId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.webhooks.detail(data.workflowId),
      })
    },
  })
}

export function useSetWebhookEnabled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      workflowId,
      enabled,
    }: {
      workflowId: string
      enabled: boolean
    }) => setWebhookEnabled(workflowId, enabled),
    onSuccess: (data) => {
      queryClient.setQueryData(
        queryKeys.webhooks.detail(data.workflowId),
        data,
      )
    },
  })
}
