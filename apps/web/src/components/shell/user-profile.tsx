'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useLogout, useSession } from '@/hooks/use-auth'

function initials(value: string): string {
  const parts = value.trim().split(/[\s@.]+/).filter(Boolean)
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  return (letters || value.slice(0, 2)).toUpperCase()
}

interface UserProfileProps {
  collapsed?: boolean
}

export function UserProfile({ collapsed = false }: UserProfileProps) {
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
    <div
      className={cn(
        'mt-auto border-t border-slate-200 bg-[#f8f8f6]',
        collapsed ? 'p-2' : 'p-3',
      )}
    >
      <div
        className={cn(
          'flex items-center',
          collapsed ? 'flex-col gap-2' : 'gap-2',
        )}
      >
        <Link
          href="/profile"
          aria-label={collapsed ? displayName : undefined}
          title={collapsed ? displayName : undefined}
          className={cn(
            'flex items-center rounded-xl border border-slate-200 bg-white transition-all duration-200 hover:border-slate-300 hover:bg-slate-50',
            collapsed
              ? 'h-9 w-9 justify-center p-0'
              : 'min-w-0 flex-1 gap-3 p-2.5',
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
            {initials(displayName)}
          </div>
          {!collapsed && (
            <div className="min-w-0 text-left">
              <div className="truncate text-sm font-semibold text-slate-900">
                {displayName}
              </div>
              {secondary && (
                <div className="truncate text-xs text-slate-600">
                  {secondary}
                </div>
              )}
            </div>
          )}
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          disabled={logout.isPending}
          aria-label="Sign out"
          title={collapsed ? 'Sign out' : undefined}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
