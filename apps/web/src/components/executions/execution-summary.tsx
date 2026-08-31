"use client";

import {
  CalendarClock,
  GitBranch,
  Hash,
  Timer,
} from "lucide-react";

import type { Execution } from "@/lib/api/types";

export function ExecutionSummary({ execution }: { execution?: Execution | null }) {
  const workflowName = execution?.workflow?.name ?? execution?.workflowId ?? "Unavailable";
  const triggerType = execution?.triggerType ?? "Unspecified";
  const startedAt = execution?.startedAt
    ? new Date(execution.startedAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "Unavailable";
  const duration =
    execution?.startedAt && execution?.completedAt
      ? `${Math.max(
          0,
          (new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000,
        ).toFixed(2)}s`
      : "Unavailable";
  const workflowVersion = execution?.workflowVersion?.version
    ? `v${execution.workflowVersion.version}`
    : "Unavailable";

  return (
    <section className="px-6 pb-4 pt-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard icon={<GitBranch />} label="Workflow" value={workflowName} />

        <SummaryCard icon={<Hash />} label="Trigger" value={triggerType} />

        <SummaryCard icon={<CalendarClock />} label="Started" value={startedAt} />

        <SummaryCard icon={<Timer />} label="Duration" value={duration} />

        <SummaryCard icon={<GitBranch />} label="Workflow Version" value={workflowVersion} />
      </div>
    </section>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400 [&>svg]:h-3.5 [&>svg]:w-3.5">
          {icon}
        </span>

        <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-400">
          {label}
        </span>
      </div>

      <p className="mt-3 truncate text-[11px] font-semibold text-slate-800">
        {value}
      </p>
    </div>
  );
}