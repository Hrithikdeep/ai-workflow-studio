'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  deleteExecution,
  getExecution,
  getExecutions,
  getExecutionStats,
  runExecution,
  type RunExecutionPayload,
} from '@/lib/api/executions'
import { queryKeys } from '@/lib/api/query-keys'

/**
 * Operational data — the dashboard must reflect the current state, so these
 * queries are always considered stale and refetch on mount / manual refresh.
 * No polling.
 */
const OPERATIONAL = { staleTime: 0 } as const

export function useExecutions() {
  return useQuery({
    queryKey: queryKeys.executions.all,
    queryFn: () => getExecutions(),
    ...OPERATIONAL,
  })
}

export function useExecution(executionId: string) {
  return useQuery({
    queryKey: queryKeys.executions.detail(executionId),
    queryFn: () => getExecution(executionId),
    enabled: Boolean(executionId),
  })
}

/** Status-aggregated counts for the dashboard (Executions / Success Rate / Running). */
export function useExecutionStats() {
  return useQuery({
    queryKey: queryKeys.executions.stats,
    queryFn: getExecutionStats,
    ...OPERATIONAL,
  })
}

/** Real failed executions, most recent first — powers "Recent Errors". */
export function useFailedExecutions() {
  return useQuery({
    queryKey: queryKeys.executions.failed,
    queryFn: () => getExecutions({ status: 'FAILED', take: 20 }),
    ...OPERATIONAL,
  })
}

/**
 * Delete a single execution record. On success the execution lists/stats are
 * invalidated so the row disappears and counts update.
 */
/**
 * Re-run an execution ("Retry"). There is no dedicated retry endpoint — this
 * re-submits the same workflow version / trigger / input through the existing
 * POST /executions/run contract and returns the newly-created execution. The
 * execution lists/stats are invalidated so the new run shows up immediately.
 */
export function useRetryExecution() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: RunExecutionPayload) => runExecution(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.executions.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.executions.failed })
      queryClient.invalidateQueries({ queryKey: queryKeys.executions.stats })
    },
  })
}

export function useDeleteExecution() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (executionId: string) => deleteExecution(executionId),
    onSuccess: (_data, executionId) => {
      queryClient.removeQueries({
        queryKey: queryKeys.executions.detail(executionId),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.executions.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.executions.failed })
      queryClient.invalidateQueries({ queryKey: queryKeys.executions.stats })
    },
  })
}
