'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferencesResult,
} from '@/lib/api/notifications'
import { queryKeys } from '@/lib/api/query-keys'

export function useNotificationPreferences() {
  return useQuery({
    queryKey: queryKeys.notificationPreferences.all,
    queryFn: getNotificationPreferences,
    staleTime: 30_000,
  })
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (preferences: Record<string, unknown>) =>
      updateNotificationPreferences(preferences),
    onSuccess: (data: NotificationPreferencesResult) => {
      queryClient.setQueryData(queryKeys.notificationPreferences.all, data)
    },
  })
}
