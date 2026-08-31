'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getTemplate,
  getTemplates,
  useTemplateById,
} from '@/lib/api/templates'
import { queryKeys } from '@/lib/api/query-keys'

export function useTemplates() {
  return useQuery({
    queryKey: queryKeys.templates.all,
    queryFn: getTemplates,
    staleTime: 30_000,
  })
}

export function useTemplate(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.templates.detail(id ?? ''),
    queryFn: () => getTemplate(id ?? ''),
    enabled: Boolean(id),
  })
}

/** Create a NEW workflow from a template. Returns `{ workflowId, versionId }`. */
export function useUseTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => useTemplateById(id),
    onSuccess: () => {
      // A new workflow now exists; refresh lists and template usage counts.
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.all })
    },
  })
}
