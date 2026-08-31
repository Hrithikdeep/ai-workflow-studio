"use client";

import { useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";

import {
  ExecutionFilters,
  type ExecutionDateRange,
  type ExecutionStatusFilter,
} from "@/components/executions/execution-filters";
import { ExecutionTable } from "@/components/executions/execution-table";
import { useDeleteExecution, useExecutions } from "@/hooks/use-executions";
import { useWorkflows } from "@/hooks/use-workflows";
import { ApiError } from "@/lib/api/client";

const DAY_MS = 24 * 60 * 60 * 1000;

export default function ExecutionsPage() {
  const {
    data: executions = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useExecutions();
  const { data: workflows = [] } = useWorkflows();
  const deleteExecution = useDeleteExecution();

  const [status, setStatus] = useState<ExecutionStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [trigger, setTrigger] = useState("");
  const [dateRange, setDateRange] = useState<ExecutionDateRange>("all");
  // Reference "now" for relative date ranges — anchored at load and re-anchored
  // on Refresh (kept out of render to stay pure).
  const [refTime, setRefTime] = useState(() => Date.now());

  const refresh = () => {
    if (isFetching) return;
    setRefTime(Date.now());
    void refetch();
  };

  // Real workflows for the picker: those the workspace has, plus any workflow
  // referenced by an execution (so a filter stays usable even if the workflow
  // list is momentarily stale). Never hardcoded.
  const workflowOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const w of workflows) {
      if (w?.id) byId.set(w.id, w.name ?? w.id);
    }
    for (const exec of executions) {
      if (exec.workflowId && !byId.has(exec.workflowId)) {
        byId.set(exec.workflowId, exec.workflow?.name ?? exec.workflowId);
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [workflows, executions]);

  // Trigger types actually present in the data (verified against the model,
  // not hardcoded).
  const triggerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const exec of executions) {
      if (exec.triggerType) set.add(String(exec.triggerType).toUpperCase());
    }
    return [...set].sort();
  }, [executions]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const cutoff =
      dateRange === "24h"
        ? refTime - DAY_MS
        : dateRange === "7d"
          ? refTime - 7 * DAY_MS
          : dateRange === "30d"
            ? refTime - 30 * DAY_MS
            : null;

    return executions.filter((exec) => {
      if (status !== "all") {
        const s = exec.status;
        if (status === "running" && s !== "RUNNING" && s !== "PENDING") {
          return false;
        }
        if (status === "success" && s !== "SUCCEEDED") return false;
        if (status === "failed" && s !== "FAILED" && s !== "CANCELLED") {
          return false;
        }
      }

      if (workflowId && exec.workflowId !== workflowId) return false;

      if (
        trigger &&
        String(exec.triggerType ?? "").toUpperCase() !== trigger
      ) {
        return false;
      }

      if (cutoff !== null) {
        const raw = exec.startedAt ?? exec.createdAt ?? null;
        const t = raw ? new Date(raw).getTime() : NaN;
        if (!Number.isFinite(t) || t < cutoff) return false;
      }

      if (query) {
        const haystack = `${exec.id} ${exec.workflow?.name ?? ""} ${
          exec.workflowId
        }`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [executions, status, search, workflowId, trigger, dateRange, refTime]);

  const handleDelete = async (
    executionId: string,
    workflowName: string,
  ) => {
    const confirmed = window.confirm(
      `Delete execution ${executionId} for "${workflowName}"?\n\n` +
        "This removes only this execution record and its step history. " +
        "The workflow and all other executions are not affected.",
    );
    if (!confirmed) return;

    try {
      await deleteExecution.mutateAsync(executionId);
    } catch (err) {
      const message =
        err instanceof ApiError && err.message
          ? err.message
          : "Could not delete the execution. Please try again.";
      window.alert(message);
    }
  };

  const emptyMessage =
    executions.length > 0 && filtered.length === 0
      ? "No executions match the current filters."
      : "No execution records found.";

  return (
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-7 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Executions
            </h1>

            <p className="mt-1 text-xs text-slate-500">
              Monitor workflow runs and investigate failures.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={isFetching}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </button>

            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <ExecutionFilters
        activeStatus={status}
        onStatusChange={setStatus}
        search={search}
        onSearchChange={setSearch}
        workflowId={workflowId}
        onWorkflowChange={setWorkflowId}
        workflowOptions={workflowOptions}
        trigger={trigger}
        onTriggerChange={setTrigger}
        triggerOptions={triggerOptions}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        count={filtered.length}
      />

      {/* Table */}
      <main className="px-7 py-5">
        <ExecutionTable
          executions={filtered}
          isLoading={isLoading}
          isError={isError}
          error={error}
          emptyMessage={emptyMessage}
          deletingId={
            deleteExecution.isPending
              ? (deleteExecution.variables ?? null)
              : null
          }
          onDelete={handleDelete}
        />
      </main>
    </div>
  );
}
