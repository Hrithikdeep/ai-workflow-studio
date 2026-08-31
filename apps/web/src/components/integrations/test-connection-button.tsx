'use client'

import { AlertTriangle, CheckCircle2, Loader2, TestTube2 } from 'lucide-react'

import { useTestIntegration } from '@/hooks/use-integrations'
import { ApiError } from '@/lib/api/client'
import type { IntegrationTestResult } from '@/lib/api/integrations'

type TestConnectionButtonProps = {
  integrationId: string
  disabled?: boolean
  onResult?: (result: IntegrationTestResult) => void
}

/**
 * Calls `POST /integrations/:id/test` (real Step 2 probe). No fake delays,
 * no synthetic results. The backend message is already sanitized of any
 * secret material.
 */
export function TestConnectionButton({
  integrationId,
  disabled = false,
  onResult,
}: TestConnectionButtonProps) {
  const test = useTestIntegration()

  const handleTest = () => {
    test.mutate(integrationId, {
      onSuccess: (result) => onResult?.(result),
    })
  }

  const result = test.data
  const errorMessage =
    test.error instanceof ApiError
      ? test.error.message
      : test.error
        ? 'The connection test could not be completed.'
        : null

  let tone: 'idle' | 'ok' | 'warn' | 'error' = 'idle'
  if (test.isPending) tone = 'idle'
  else if (errorMessage) tone = 'error'
  else if (result?.ok) tone = 'ok'
  else if (result?.code === 'NOT_SUPPORTED_YET') tone = 'warn'
  else if (result) tone = 'error'

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleTest}
        disabled={disabled || test.isPending}
        className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {test.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <TestTube2 className="h-3.5 w-3.5" />
        )}
        {test.isPending ? 'Testing…' : 'Test connection'}
      </button>

      {tone !== 'idle' && (
        <div
          className={[
            'flex items-start gap-1.5 rounded-md border px-2.5 py-2 text-[10px] leading-4',
            tone === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : tone === 'warn'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-red-200 bg-red-50 text-red-600',
          ].join(' ')}
        >
          {tone === 'ok' ? (
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          )}
          <span>{errorMessage ?? result?.message}</span>
        </div>
      )}
    </div>
  )
}
