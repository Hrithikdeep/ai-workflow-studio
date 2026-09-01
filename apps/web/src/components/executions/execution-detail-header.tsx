"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, RotateCcw, Trash2 } from "lucide-react";

import { useDeleteExecution, useRetryExecution } from "@/hooks/use-executions";
import { ApiError } from "@/lib/api/client";

type ExecutionDetailHeaderProps = {
  executionId?: string;
  workflowId?: string | null;
  workflowVersionId?: string | null;
  workflowName?: string;
  status?: string | null;
  triggerType?: string | null;
  input?: Record<string, unknown> | null;
};

export function ExecutionDetailHeader({
  executionId = "",
  workflowId,
  workflowVersionId,
  workflowName = "Unknown workflow",
  status,
  triggerType,
  input,
}: ExecutionDetailHeaderProps) {
  const router = useRouter();
  const retryExecution = useRetryExecution();
  const deleteExecution = useDeleteExecution();
  // Synchronous latch: `isPending` only flips on the next render, so a second
  // click in the same tick could otherwise fire a second POST /executions/run.
  const retryingRef = useRef(false);

  const normalizedStatus = (status ?? "").toUpperCase();
  const isInProgress =
    normalizedStatus === "RUNNING" || normalizedStatus === "PENDING";
  const canRetry =
    Boolean(workflowId) && !isInProgress && !retryExecution.isPending;

  const handleRetry = async () => {
    if (!workflowId || retryingRef.current || retryExecution.isPending) {
      return;
    }
    retryingRef.current = true;

    try {
      const created = await retryExecution.mutateAsync({
        workflowId,
        workflowVersionId: workflowVersionId ?? undefined,
        triggerType: triggerType ?? undefined,
        input: input ?? undefined,
      });
      router.push(`/executions/${created.id}`);
    } catch (err) {
      const message =
        err instanceof ApiError && err.message
          ? err.message
          : "Could not retry this execution. Please try again.";
      window.alert(message);
    } finally {
      retryingRef.current = false;
    }
  };

  const handleDelete = async () => {
    if (!executionId || deleteExecution.isPending) {
      return;
    }

    const confirmed = window.confirm(
      `Delete execution ${executionId} for "${workflowName}"?\n\n` +
        "This removes only this execution record and its step history. " +
        "The workflow and all other executions are not affected.",
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteExecution.mutateAsync(executionId);
      router.push("/executions");
    } catch (err) {
      // Already gone — treat as deleted and return to the list.
      if (err instanceof ApiError && err.status === 404) {
        router.push("/executions");
        return;
      }

      const message =
        err instanceof ApiError && err.message
          ? err.message
          : "Could not delete this execution. Please try again.";
      window.alert(message);
    }
  };

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/executions")}
            aria-label="Back to executions"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-slate-900">
                Execution {executionId}
              </h1>

              <StatusBadge status={status} />
            </div>

            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {workflowName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRetry}
            disabled={!canRetry}
            className="hidden h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex"
          >
            <RotateCcw
              className={`h-3.5 w-3.5 ${
                retryExecution.isPending ? "animate-spin" : ""
              }`}
            />
            {retryExecution.isPending ? "Retrying..." : "Retry Execution"}
          </button>

          <button
            type="button"
            onClick={() => {
              if (!workflowId) {
                return;
              }
              // Navigate straight to the exact version this execution ran, so
              // the editor can load its graph immediately instead of first
              // round-tripping to resolve the latest version.
              router.push(
                workflowVersionId
                  ? `/workflows/${workflowId}/${workflowVersionId}`
                  : `/workflows/${workflowId}`,
              );
            }}
            disabled={!workflowId}
            className="hidden h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-3 text-[11px] font-medium text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex"
          >
            <Play className="h-3.5 w-3.5" />
            View Workflow
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={!executionId || deleteExecution.isPending}
            className="hidden h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleteExecution.isPending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </header>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  const normalizedStatus = (status ?? "PENDING").toUpperCase();

  const palette: Record<string, { className: string; dot: string; label: string }> = {
    PENDING: {
      className: "border-amber-200 bg-amber-50 text-amber-600",
      dot: "bg-amber-500",
      label: "PENDING",
    },
    RUNNING: {
      className: "border-blue-200 bg-blue-50 text-blue-600",
      dot: "bg-blue-500",
      label: "RUNNING",
    },
    SUCCEEDED: {
      className: "border-emerald-200 bg-emerald-50 text-emerald-600",
      dot: "bg-emerald-500",
      label: "SUCCESS",
    },
    FAILED: {
      className: "border-rose-200 bg-rose-50 text-rose-600",
      dot: "bg-rose-500",
      label: "FAILED",
    },
    CANCELLED: {
      className: "border-slate-200 bg-slate-100 text-slate-600",
      dot: "bg-slate-500",
      label: "CANCELLED",
    },
  };

  const config = palette[normalizedStatus] ?? {
    className: "border-slate-200 bg-slate-100 text-slate-600",
    dot: "bg-slate-500",
    label: normalizedStatus,
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${config.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
