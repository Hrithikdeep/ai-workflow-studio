'use client'

import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navigationItems, NavigationSection } from '@/lib/navigation'
import { NavigationItem } from './navigation-item'
import { WorkspaceSwitcher } from './workspace-switcher'
import { UserProfile } from './user-profile'

function NavigationSectionGroup({
  title,
  section,
  collapsed,
}: {
  title: string
  section: NavigationSection
  collapsed: boolean
}) {
  const items = navigationItems.filter((item) => item.section === section)

  return (
    <div className={collapsed ? 'px-2' : 'px-3'}>
      {collapsed ? (
        <div className="mx-2 mb-1 border-t border-slate-200" aria-hidden="true" />
      ) : (
        <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          {title}
        </div>
      )}

      <div className="space-y-0.5">
        {items.map((item) => (
          <NavigationItem key={item.id} item={item} collapsed={collapsed} />
        ))}
      </div>
    </div>
  )
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-slate-200 bg-slate-100/80 backdrop-blur-sm transition-[width] duration-200',
        collapsed ? 'w-[72px]' : 'w-[260px]',
      )}
    >
      <div className="flex items-center gap-2 border-b border-slate-200 bg-[#f8f8f6] p-2">
        <div className="min-w-0 flex-1">
          <WorkspaceSwitcher collapsed={collapsed} />
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className={cn('border-b border-slate-200', collapsed ? 'p-2' : 'p-3')}>
        <button
          type="button"
          aria-label="Search"
          title={collapsed ? 'Search' : undefined}
          className={cn(
            'flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 transition-colors hover:bg-slate-100',
            collapsed ? 'w-full justify-center' : 'w-full gap-3 px-3',
          )}
        >
          <Search className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search</span>
              <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-500">
                ⌘K
              </span>
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        <div className="space-y-4">
          <NavigationSectionGroup
            title="Platform"
            section="platform"
            collapsed={collapsed}
          />
          <NavigationSectionGroup
            title="Build"
            section="build"
            collapsed={collapsed}
          />
          <NavigationSectionGroup
            title="Manage"
            section="manage"
            collapsed={collapsed}
          />
        </div>
      </div>

      <UserProfile collapsed={collapsed} />
    </aside>
  )
}
