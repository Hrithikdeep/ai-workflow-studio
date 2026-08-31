'use client'

import { cn } from '@/lib/utils'
import { useSidebarCollapsed } from '@/store/ui-store'
import { Sidebar } from './sidebar'
import { TopNavigation } from './top-navigation'
import { PageContainer } from './page-container'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { collapsed, toggle } = useSidebarCollapsed()

  return (
    <div
      data-app-shell=""
      className="min-h-screen bg-[#f8fafc] text-slate-900"
    >
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <div
        className={cn(
          'min-h-screen bg-[#f8fafc] transition-[margin] duration-200',
          collapsed ? 'ml-[72px]' : 'ml-[260px]',
        )}
      >
        <TopNavigation />

        <PageContainer>{children}</PageContainer>
      </div>
    </div>
  )
}
