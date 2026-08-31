'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { useSession } from '@/hooks/use-auth'
import { ApiError } from '@/lib/api/client'

/**
 * Client-side companion to `proxy.ts`.
 *
 * The proxy bounces requests with no `AWF_AT` cookie. This guard
 * covers the case where a cookie IS present but the API rejects it
 * (expired / cleared server session): `GET /auth/me` returns
 * `{ user: null }` and we redirect to `/login`.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data, isLoading, isError, error, refetch } = useSession()

  const authenticated = Boolean(data?.user)

  useEffect(() => {
    if (!isLoading && !isError && !authenticated) {
      const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : ''
      router.replace(`/login${next}`)
    }
  }, [authenticated, isLoading, isError, pathname, router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (isError) {
    const message =
      error instanceof ApiError
        ? error.message
        : 'Could not reach the server. Check that the API is running.'
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-6">
        <div className="max-w-sm rounded-xl border border-slate-200 bg-white px-6 py-8 text-center">
          <p className="text-sm font-semibold text-slate-800">
            Unable to verify your session
          </p>
          <p className="mt-1 text-xs text-slate-500">{message}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    // Redirect is in-flight from the effect above.
    return null
  }

  return <>{children}</>
}
