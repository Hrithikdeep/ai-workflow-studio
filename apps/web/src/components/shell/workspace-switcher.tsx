'use client'

import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WorkspaceSwitcherProps {
  collapsed?: boolean
}

export function WorkspaceSwitcher({ collapsed = false }: WorkspaceSwitcherProps) {
  return (
    <button
      type="button"
      aria-label="AI Workflow Studio — Team workspace"
      title={collapsed ? 'AI Workflow Studio' : undefined}
      className={cn(
        'flex items-center rounded-xl border border-slate-200 bg-white text-left transition-colors hover:bg-slate-50',
        collapsed ? 'h-9 w-9 justify-center p-0' : 'w-full justify-between p-2',
      )}
    >
      <div className={cn('flex items-center', collapsed ? '' : 'gap-3')}>
        <div
          className={cn(
            'flex items-center justify-center rounded-xl bg-slate-900 text-white',
            collapsed ? 'h-9 w-9 text-xs font-bold' : 'h-9 w-9 text-sm font-bold',
          )}
        >
          AE
        </div>

        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              AI Workflow Studio
            </div>
            <div className="text-xs text-slate-600">Team workspace</div>
          </div>
        )}
      </div>

      {!collapsed && <ChevronDown className="h-4 w-4 text-slate-700" />}
    </button>
  )
}
