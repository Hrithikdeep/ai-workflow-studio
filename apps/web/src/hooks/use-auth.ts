'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  getMe,
  login,
  logout,
  signup,
  updateMe,
  type UpdateProfileInput,
} from '@/lib/api/auth'
import { queryKeys } from '@/lib/api/query-keys'

/**
 * Reads the current session from `GET /auth/me`. `data.user` is `null`
 * when the request carries no valid `AWF_AT` cookie.
 */
export function useSession() {
  return useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: getMe,
    staleTime: 60_000,
    retry: false,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: login,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.session })
    },
  })
}

export function useSignup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: signup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.session })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      // Drop every cached query so no workspace-scoped data leaks across sessions.
      queryClient.clear()
    },
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => updateMe(input),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.auth.session, data)
    },
  })
}
