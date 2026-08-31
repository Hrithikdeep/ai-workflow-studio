"use client";

import type { Execution } from "@/lib/api/types";

function statusPillClass(status: string): string {
  switch (status) {
    case "SUCCEEDED":
    case "SUCCESS":
      return "border-emerald-200 bg-emerald-50 text-emerald-600";
    case "FAILED":
      return "border-rose-200 bg-rose-50 text-rose-600";
    case "RUNNING":
      return "border-blue-200 bg-blue-50 text-blue-600";
    case "SKIPPED":
      return "border-amber-200 bg-amber-50 text-amber-600";
    case "CANCELLED":
      return "border-slate-300 bg-slate-100 text-slate-600";
    default:
      // PENDING / unknown
      return "border-slate-200 bg-white text-slate-500";
  }
}

type ExecutionTimelineProps = {
  execution?: Execution | null;
  selectedStepId?: string | null;
  onSelectStep?: (stepId: string) => void;
};

export function ExecutionTimeline({
  execution,
  selectedStepId,
  onSelectStep,
}: ExecutionTimelineProps) {
  const steps = execution?.steps ?? [];
  const graphNodes = execution?.workflowVersion?.nodes ?? [];
  const displaySteps =
    steps.length > 0
      ? steps
      : graphNodes.map((node) => ({
          id: node.id,
          nodeId: node.id,
          status: "PENDING",
          duration: null,
          node: {
            id: node.id,
            label: node.label ?? node.id,
            type: node.type ?? "NODE",
          },
        }));

  if (!displaySteps.length) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Execution Graph
            </span>
          </div>

          <span className="text-[10px] font-medium text-slate-400">
            {execution?.completedAt && execution?.startedAt
              ? `${(
                  (new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()) /
                  1000
                ).toFixed(2)}s total`
              : "No duration"}
          </span>
        </div>

        <div className="flex min-h-[220px] items-center justify-center p-6 text-center text-[11px] text-slate-500">
          Execution graph is not available for this run yet.
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.02)]">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Execution Graph
          </span>
        </div>

        <span className="text-[10px] font-medium text-slate-400">
          {displaySteps.length} node{displaySteps.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-3 p-4">
        {displaySteps.map((step, index) => {
          const status = (step.status ?? "PENDING").toUpperCase();
          const label = step.node?.label ?? step.nodeId ?? `Node ${index + 1}`;
          const duration = step.duration != null ? `${(step.duration / 1000).toFixed(2)}s` : "Pending";
          const stepId = step.id ?? step.nodeId ?? String(index);
          const isSelected = selectedStepId != null && stepId === selectedStepId;

          return (
            <button
              key={stepId}
              type="button"
              onClick={() => onSelectStep?.(stepId)}
              aria-pressed={isSelected}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${
                isSelected
                  ? "border-blue-300 bg-blue-50/60 ring-1 ring-blue-200"
                  : "border-slate-200 bg-slate-50 hover:bg-slate-100/70"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-[9px] font-semibold text-slate-500">
                    {index + 1}
                  </span>

                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-semibold text-slate-700">
                      {label}
                    </div>
                    <div className="text-[9px] text-slate-400">
                      {step.node?.type ?? "NODE"}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] ${statusPillClass(status)}`}
                  >
                    {status}
                  </div>
                  <div className="mt-1 text-[8px] text-slate-400">{duration}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
