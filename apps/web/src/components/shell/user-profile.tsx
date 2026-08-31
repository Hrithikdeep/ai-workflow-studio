'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

import { useLogout, useSession } from '@/hooks/use-auth'

function initials(value: string): string {
  const parts = value.trim().split(/[\s@.]+/).filter(Boolean)
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  return (letters || value.slice(0, 2)).toUpperCase()
}

export function UserProfile() {
  const router = useRouter()
  const { data } = useSession()
  const logout = useLogout()

  const user = data?.user
  const displayName = user?.name || user?.email || 'Account'
  const secondary = user?.name ? user.email : user ? 'Signed in' : ''

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => router.replace('/login'),
    })
  }

  return (
    <div className="mt-auto border-t border-slate-200 bg-[#f8f8f6] p-3">
      <div className="flex items-center gap-2">
        <Link
          href="/profile"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
            {initials(displayName)}
          </div>
          <div className="min-w-0 text-left">
            <div className="truncate text-sm font-semibold text-slate-900">
              {displayName}
            </div>
            {secondary && (
              <div className="truncate text-xs text-slate-600">{secondary}</div>
            )}
          </div>
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          disabled={logout.isPending}
          aria-label="Sign out"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
