"use client"

import { MoreHorizontal } from "lucide-react";
import { useWorkflows } from "@/hooks/use-workflows";
import { useRouter } from "next/navigation";

export function RecentWorkflows() {
  const { data: workflows = [], isLoading } = useWorkflows();
  const router = useRouter();

  // Sort by updatedAt desc and show top 3
  const items = [...workflows]
    .sort((a, b) => {
      const aDate = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
      const bDate = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
      return bDate - aDate;
    })
    .slice(0, 3);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          Recent Workflows
        </h2>

        <button
          type="button"
          onClick={() => router.push('/workflows')}
          className="flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900"
        >
          View all
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {isLoading && <div>Loading…</div>}

        {!isLoading && items.map((w) => (
          <article key={w.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">{w.name}</h3>
              </div>

              <StatusBadge status={w.status} />
            </div>

            <div className="my-4 border-t border-slate-100" />

            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Updated {w.updatedAt ? new Date(w.updatedAt).toLocaleString() : '—'}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/workflows/${w.id}`)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Open
                </button>

                <button
                  type="button"
                  aria-label={`More options for ${w.name}`}
                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
                >
                  <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status || status === 'DRAFT') {
    return (
      <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
        <span className="mr-1">●</span>
        Draft
      </span>
    );
  }

  return (
    <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
      <span className="mr-1">●</span>
      Active
    </span>
  );
}