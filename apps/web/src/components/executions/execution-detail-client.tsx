"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { useExecution } from "@/hooks/use-executions";
import { ExecutionDetailHeader } from "@/components/executions/execution-detail-header";
import { ExecutionSummary } from "@/components/executions/execution-summary";
import { ExecutionTimeline } from "@/components/executions/execution-timeline";
import { ExecutionOutputPanel } from "@/components/executions/execution-output-panel";

export function ExecutionDetailClient({
  executionId,
}: {
  executionId: string;
}) {
  const {
    data: execution,
    isLoading,
    isError,
    error,
  } = useExecution(executionId);

  // The selected step drives the right-side output panel. Kept as raw state and
  // resolved against the loaded steps below so a stale id can never leak.
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-full bg-slate-50 px-6 py-10 text-sm text-slate-500">
        Loading execution details...
      </div>
    );
  }

  if (isError || !execution) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Execution not found.";

    return (
      <div className="min-h-full bg-slate-50 px-6 py-10 text-sm text-slate-500">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center">
          <p>{message}</p>

          <Link
            href="/executions"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to executions
          </Link>
        </div>
      </div>
    );
  }

  const steps = execution.steps ?? [];
  const effectiveStepId =
    selectedStepId && steps.some((step) => step.id === selectedStepId)
      ? selectedStepId
      : // Default to the first recorded step. When a run has no recorded steps
        // yet (graph-only view) keep whatever synthetic node the user clicked.
        (steps[0]?.id ?? selectedStepId ?? null);

  return (
    <div className="min-h-full bg-slate-50">
      <ExecutionDetailHeader
        executionId={executionId}
        workflowId={execution.workflowId}
        workflowVersionId={execution.workflowVersionId}
        workflowName={
          execution.workflow?.name ??
          execution.workflowId ??
          "Unknown workflow"
        }
        status={execution.status}
        triggerType={execution.triggerType}
        input={execution.input}
      />

      <ExecutionSummary execution={execution} />

      <main className="grid gap-5 px-6 pb-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(310px,0.8fr)]">
        <ExecutionTimeline
          execution={execution}
          selectedStepId={effectiveStepId}
          onSelectStep={setSelectedStepId}
        />

        <ExecutionOutputPanel
          execution={execution}
          selectedStepId={effectiveStepId}
        />
      </main>
    </div>
  );
}
