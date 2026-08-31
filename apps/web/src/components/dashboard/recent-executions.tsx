"use client";

import { useRouter } from "next/navigation";

import { useExecutions } from "@/hooks/use-executions";

export function RecentExecutions() {
  const router = useRouter();
  const { data: executions = [], isLoading } = useExecutions();

  const items = [...executions]
    .sort((a, b) => {
      const aDate = new Date(a.createdAt ?? 0).getTime();
      const bDate = new Date(b.createdAt ?? 0).getTime();
      return bDate - aDate;
    })
    .slice(0, 5);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Recent Executions</h2>

        <button
          type="button"
          onClick={() => router.push('/executions')}
          className="text-xs font-medium text-slate-500 transition hover:text-slate-900"
        >
          View all ↗
        </button>
      </div>

      {isLoading ? (
        <div className="p-6 text-sm text-slate-500">Loading executions…</div>
      ) : items.length === 0 ? (
        <div className="p-6 text-sm text-slate-500">No execution history yet.</div>
      ) : (
        <div className="divide-y divide-slate-200">
          {items.map((execution) => (
            <div key={execution.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-900">
                  {execution.workflow?.name ?? execution.workflowId}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <span>{execution.id}</span>
                  <span>•</span>
                  <span>{execution.status}</span>
                  <span>•</span>
                  <span>
                    {execution.createdAt
                      ? new Date(execution.createdAt).toLocaleString()
                      : '—'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => router.push(`/executions/${execution.id}`)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Open
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}