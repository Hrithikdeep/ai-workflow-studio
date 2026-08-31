"use client";

import {
  CheckCircle2,
  Circle,
  GitBranch,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { useExecutions } from "@/hooks/use-executions";

type Activity = {
  id: string;
  type: string;
  title: string;
  meta: string;
  time: string;
};

export function ActivityTimeline() {
  const { data: executions = [], isLoading, error, isError } = useExecutions();

  const activities: Activity[] = [...executions]
    .sort(
      (a, b) =>
        new Date(b.createdAt ?? b.startedAt ?? 0).getTime() -
        new Date(a.createdAt ?? a.startedAt ?? 0).getTime()
    )
    .slice(0, 6)
    .map((execution) => {
      const workflowName = execution.workflow?.name ?? execution.workflowId;
      const triggerLabel = execution.triggerType ?? "MANUAL";
      const timestamp = execution.startedAt ?? execution.createdAt ?? "";
      const status = execution.status ?? "PENDING";

      const type =
        status === "FAILED"
          ? "error"
          : status === "RUNNING"
            ? "integration"
            : status === "PENDING"
              ? "publish"
              : "success";

      const title =
        status === "FAILED"
          ? `${workflowName} failed`
          : status === "RUNNING"
            ? `${workflowName} is running`
            : status === "PENDING"
              ? `${workflowName} queued`
              : `${workflowName} completed`;

      return {
        id: execution.id,
        type,
        title,
        meta: `${triggerLabel} • ${execution.id}`,
        time: formatTime(timestamp),
      };
    });

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Circle
            className="h-4 w-4 text-slate-500"
            strokeWidth={1.8}
          />

          <h2 className="text-sm font-semibold text-slate-900">
            Activity
          </h2>
        </div>
      </div>

      <div className="px-4 py-3">
        {isLoading && (
          <div className="text-sm text-slate-500">
            Loading…
          </div>
        )}

        {!isLoading && isError && (
          <div className="text-sm text-red-600">
            {error instanceof Error ? error.message : "Failed to load activity."}
          </div>
        )}

        {!isLoading && !isError && activities.length === 0 && (
          <div className="text-sm text-slate-500">
            No recent activity.
          </div>
        )}

        {!isLoading && !isError &&
          activities.map((activity, index) => (
            <ActivityItemRow
              key={activity.id}
              activity={activity}
              isLast={index === activities.length - 1}
            />
          ))}
      </div>
    </section>
  );
}

function ActivityItemRow({
  activity,
  isLast,
}: {
  activity: Activity;
  isLast: boolean;
}) {
  return (
    <div className="relative flex gap-3">
      {!isLast && (
        <div className="absolute left-[9px] top-5 h-[calc(100%-1px)] w-px bg-slate-200" />
      )}

      <div className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white">
        <ActivityIcon type={activity.type} />
      </div>

      <div className="min-w-0 flex-1 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium leading-5 text-slate-900">
              {activity.title}
            </p>

            <p className="text-[11px] text-slate-400">
              {activity.meta}
            </p>
          </div>

          <span className="shrink-0 text-[11px] text-slate-400">
            {activity.time}
          </span>
        </div>
      </div>
    </div>
  );
}

function ActivityIcon({ type }: { type: string }) {
  const className = "h-4 w-4";

  switch (type) {
    case "error":
      return (
        <XCircle
          className={`${className} text-red-500`}
          strokeWidth={1.8}
        />
      );

    case "publish":
      return (
        <GitBranch
          className={`${className} text-blue-500`}
          strokeWidth={1.8}
        />
      );

    case "integration":
      return (
        <RotateCcw
          className={`${className} text-slate-500`}
          strokeWidth={1.8}
        />
      );

    case "completed":
    case "success":
      return (
        <CheckCircle2
          className={`${className} text-slate-400`}
          strokeWidth={1.8}
        />
      );

    default:
      return (
        <Circle
          className={`${className} text-slate-400`}
          strokeWidth={1.8}
        />
      );
  }
}

function formatTime(timestamp: string) {
  if (!timestamp) return "";

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString();
}