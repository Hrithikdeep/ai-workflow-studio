import api from './client'

export type NotificationPreferencesResult = {
  preferences: Record<string, unknown> | null
  updatedAt: string | null
}

export function getNotificationPreferences() {
  return api.get<NotificationPreferencesResult>('/notification-preferences')
}

export function updateNotificationPreferences(
  preferences: Record<string, unknown>,
) {
  return api.patch<NotificationPreferencesResult>(
    '/notification-preferences',
    { preferences },
  )
}
