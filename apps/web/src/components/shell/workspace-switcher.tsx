'use client'

import { ChevronDown } from 'lucide-react'

export function WorkspaceSwitcher() {
  return (
    <div className="border-b border-slate-200 bg-[#f8f8f6] p-3">
      <button className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-2 text-left transition-colors hover:bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">
            AE
          </div>

          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              AI Workflow Studio
            </div>
            <div className="text-xs text-slate-600">Team workspace</div>
          </div>
        </div>

        <ChevronDown className="h-4 w-4 text-slate-700" />
      </button>
    </div>
  )
}