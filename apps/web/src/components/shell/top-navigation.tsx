'use client'

import Link from 'next/link'
import { Bell, ChevronRight, Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { navigationItems } from '@/lib/navigation'
import { useLogout, useSession } from '@/hooks/use-auth'
import { useTheme } from '@/providers/theme-provider'

function initials(value: string): string {
  const parts = value.trim().split(/[\s@.]+/).filter(Boolean)
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  return (letters || value.slice(0, 2)).toUpperCase()
}

export function TopNavigation() {
  const router = useRouter()
  const { data } = useSession()
  const logout = useLogout()
  const { theme, toggleTheme } = useTheme()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const user = data?.user
  const avatarLabel = initials(user?.name || user?.email || 'Account')

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <header className="sticky top-0 z-20 h-16 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="flex h-full items-center justify-between px-6">
        <DynamicBreadcrumb />

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={
              theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
            aria-pressed={theme === 'dark'}
            title={
              theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white transition-colors hover:bg-slate-50"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-slate-600" />
            ) : (
              <Moon className="h-4 w-4 text-slate-600" />
            )}
          </button>

          <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white transition-colors hover:bg-slate-50">
            <Bell className="h-4 w-4 text-slate-600" />
          </button>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsMenuOpen((current) => !current)}
              aria-label="Open account menu"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              {avatarLabel}
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                <div className="py-1">
                  <Link
                    href="/profile"
                    onClick={() => setIsMenuOpen(false)}
                    className="block px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Profile
                  </Link>

                  <Link
                    href="/settings"
                    onClick={() => setIsMenuOpen(false)}
                    className="block px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Settings
                  </Link>
                </div>

                <div className="border-t border-slate-200" />

                <button
                  type="button"
                  disabled={logout.isPending}
                  onClick={() => {
                    setIsMenuOpen(false)
                    logout.mutate(undefined, {
                      onSettled: () => router.replace('/login'),
                    })
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  {logout.isPending ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function DynamicBreadcrumb() {
  const pathname = usePathname() ?? '/dashboard'

  const match = navigationItems.find((item) => pathname.startsWith(item.href))

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">AI Workflow Studio</span>

      <ChevronRight className="h-4 w-4 text-slate-400" />

      <span className="font-semibold text-slate-900">{match ? match.label : 'Dashboard'}</span>
    </div>
  )
}