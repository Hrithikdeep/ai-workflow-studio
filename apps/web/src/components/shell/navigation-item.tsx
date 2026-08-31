'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NavigationItem as NavigationItemType } from '@/lib/navigation'
import { cn } from '../../lib/utils'

interface NavigationItemProps {
  item: NavigationItemType
  collapsed?: boolean
}

export function NavigationItem({ item, collapsed = false }: NavigationItemProps) {
  const pathname = usePathname()

  const isActive =
    pathname === item.href || pathname.startsWith(`${item.href}/`)

  const Icon = item.icon

  return (
    <Link
      href={item.href}
      aria-label={collapsed ? item.label : undefined}
      aria-current={isActive ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'group relative flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200',
        collapsed ? 'justify-center' : 'gap-3',
        isActive
          ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      )}
    >
      {isActive && (
        <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-blue-600" />
      )}

      <Icon className="h-4 w-4 flex-shrink-0" />

      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>

          {item.badge && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
              {item.badge}
            </span>
          )}
        </>
      )}
    </Link>
  )
}
