"use client";

import Link from "next/link";

import {
  ArrowUpRight,
  Clock3,
  Trash2,
} from "lucide-react";

import type { Execution } from "@/lib/api/types";

type ExecutionStatus =
  | "success"
  | "failed"
  | "running";

type ExecutionRow = {
  id: string;
  workflow: string;
  trigger: string;
  status: ExecutionStatus;
  duration: string;
  started: string;
};

function normalizeExecutionStatus(
  status?: string | null,
): ExecutionStatus {
  switch (status) {
    case "SUCCEEDED":
      return "success";
    case "FAILED":
    case "CANCELLED":
      return "failed";
    case "PENDING":
    case "RUNNING":
    default:
      return "running";
  }
}

function normalizeTriggerType(
  triggerType?: string | null,
): string {
  if (!triggerType) {
    return "Manual";
  }

  const normalized = triggerType.toUpperCase();

  if (normalized === "MANUAL") {
    return "Manual";
  }

  if (normalized === "WEBHOOK") {
    return "Webhook";
  }

  return triggerType
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1).toLowerCase(),
    )
    .join(" ");
}

function formatDuration(execution: Execution): string {
  if (!execution.startedAt) {
    return "—";
  }

  const start = new Date(execution.startedAt).getTime();

  if (Number.isNaN(start)) {
    return "—";
  }

  const end = execution.completedAt
    ? new Date(execution.completedAt).getTime()
    : Date.now();

  const durationMs = Math.max(0, end - start);

  if (durationMs === 0) {
    return execution.status === "RUNNING" ? "—" : "0s";
  }

  const seconds = durationMs / 1000;

  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  }

  const minutes = seconds / 60;

  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }

  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
}

function formatRelativeTime(value?: string | null): string {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  const diffMs = Date.now() - date.getTime();

  if (diffMs < 60_000) {
    return "Just now";
  }

  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function toExecutionRow(execution: Execution): ExecutionRow {
  const workflowName =
    execution.workflow?.name ??
    execution.workflowId ??
    "Unknown workflow";

  return {
    id: execution.id,
    workflow: workflowName,
    trigger: normalizeTriggerType(execution.triggerType),
    status: normalizeExecutionStatus(execution.status),
    duration: formatDuration(execution),
    started: formatRelativeTime(
      execution.startedAt ?? execution.createdAt ?? null,
    ),
  };
}

type ExecutionTableProps = {
  executions: Execution[];
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  emptyMessage?: string;
  deletingId?: string | null;
  onDelete: (executionId: string, workflowName: string) => void;
};

export function ExecutionTable({
  executions,
  isLoading,
  isError,
  error,
  emptyMessage = "No execution records found.",
  deletingId = null,
  onDelete,
}: ExecutionTableProps) {
  const rows = executions.map(toExecutionRow);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70">
              <TableHeader>EXECUTION</TableHeader>
              <TableHeader>WORKFLOW</TableHeader>
              <TableHeader>TRIGGER</TableHeader>
              <TableHeader>STATUS</TableHeader>
              <TableHeader>DURATION</TableHeader>
              <TableHeader>STARTED</TableHeader>
              <TableHeader />
            </tr>
          </thead>

          <tbody>
            {isLoading && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-sm text-slate-500"
                >
                  Loading executions...
                </td>
              </tr>
            )}

            {/* Full-width error only when there is nothing to show — e.g. the
                initial load failed. A failed background refresh keeps the
                last-loaded rows visible (see the strip below). */}
            {!isLoading && isError && rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-sm text-red-600"
                >
                  Unable to load execution records.
                  {error instanceof Error ? ` ${error.message}` : ""}
                </td>
              </tr>
            )}

            {/* A refresh failed but we still have data — surface it without
                destroying the list the user was looking at. */}
            {!isLoading && isError && rows.length > 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="border-b border-red-100 bg-red-50/60 px-4 py-2 text-center text-[11px] text-red-600"
                >
                  Could not refresh. Showing the last loaded results.
                </td>
              </tr>
            )}

            {!isLoading && !isError && rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-sm text-slate-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}

            {!isLoading && rows.length > 0 &&
              rows.map((execution) => (
                <ExecutionRowView
                  key={execution.id}
                  execution={execution}
                  deleting={deletingId === execution.id}
                  onDelete={onDelete}
                />
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExecutionRowView({
  execution,
  deleting,
  onDelete,
}: {
  execution: ExecutionRow;
  deleting: boolean;
  onDelete: (executionId: string, workflowName: string) => void;
}) {
  return (
    <tr className="group border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
      <td className="px-4 py-3">
        <Link
          href={`/executions/${execution.id}`}
          className="text-[11px] font-semibold text-slate-800 hover:text-blue-600"
        >
          {execution.id}
        </Link>
      </td>

      <td className="px-4 py-3">
        <span className="text-[11px] text-slate-700">
          {execution.workflow}
        </span>
      </td>

      <td className="px-4 py-3">
        <span className="text-[10px] text-slate-400">
          {execution.trigger}
        </span>
      </td>

      <td className="px-4 py-3">
        <StatusBadge status={execution.status} />
      </td>

      <td className="px-4 py-3">
        <span className="text-[10px] text-slate-500">
          {execution.duration}
        </span>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Clock3 className="h-3 w-3 text-slate-300" />

          <span className="text-[10px] text-slate-400">
            {execution.started}
          </span>
        </div>
      </td>

      <td className="px-3 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/executions/${execution.id}`}
            aria-label={`Open ${execution.id}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 opacity-70 transition-all hover:bg-white hover:text-slate-600 group-hover:opacity-100"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>

          <button
            type="button"
            disabled={deleting}
            onClick={() => onDelete(execution.id, execution.workflow)}
            aria-label={`Delete execution ${execution.id}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 opacity-70 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function StatusBadge({
  status,
}: {
  status: ExecutionStatus;
}) {
  const config = {
    success: {
      label: "SUCCESS",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-600",
      dot: "bg-emerald-500",
    },
    failed: {
      label: "FAILED",
      className:
        "border-red-200 bg-red-50 text-red-600",
      dot: "bg-red-500",
    },
    running: {
      label: "RUNNING",
      className:
        "border-sky-200 bg-sky-50 text-sky-600",
      dot: "bg-sky-500",
    },
  }[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-semibold ${config.className}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${config.dot}`}
      />

      {config.label}
    </span>
  );
}

function TableHeader({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <th className="px-4 py-2.5 text-left text-[8px] font-semibold tracking-[0.08em] text-slate-400">
      {children}
    </th>
  );
}