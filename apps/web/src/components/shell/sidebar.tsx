'use client'

import { Search } from 'lucide-react'
import { navigationItems, NavigationSection } from '@/lib/navigation'
import { NavigationItem } from './navigation-item'
import { WorkspaceSwitcher } from './workspace-switcher'
import { UserProfile } from './user-profile'

function NavigationSectionGroup({
  title,
  section,
}: {
  title: string
  section: NavigationSection
}) {
  const items = navigationItems.filter((item) => item.section === section)

  return (
    <div className="px-3">
      <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {title}
      </div>

      <div className="space-y-0.5">
        {items.map((item) => (
          <NavigationItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-[260px] flex-col border-r border-slate-200 bg-slate-100/80 backdrop-blur-sm">
      <WorkspaceSwitcher />

      <div className="border-b border-slate-200 p-3">
        <button className="flex h-10 w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 transition-colors hover:bg-slate-100">
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search</span>
          <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-500">
            ⌘K
          </span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        <div className="space-y-4">
          <NavigationSectionGroup title="Platform" section="platform" />
          <NavigationSectionGroup title="Build" section="build" />
          <NavigationSectionGroup title="Manage" section="manage" />
        </div>
      </div>

      <UserProfile />
    </aside>
  )
}