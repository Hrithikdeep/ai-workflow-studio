'use client'

import { Sidebar } from './sidebar'
import { TopNavigation } from './top-navigation'
import { PageContainer } from './page-container'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <Sidebar />

      <div className="ml-[260px] min-h-screen bg-[#f8fafc]">
        <TopNavigation />

        <PageContainer>{children}</PageContainer>
      </div>
    </div>
  )
}