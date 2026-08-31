"use client";

import { Settings2 } from "lucide-react";

export function SystemHealth() {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Settings2
            className="h-4 w-4 text-slate-500"
            strokeWidth={1.8}
          />

          <h2 className="text-sm font-semibold text-slate-900">
            System Health
          </h2>
        </div>
      </div>

      <div className="p-6 text-sm text-slate-500">
        No system health data available.
      </div>
    </section>
  );
}