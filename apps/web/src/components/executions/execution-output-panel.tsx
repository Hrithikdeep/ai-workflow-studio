"use client";

import { useState } from "react";
import {
  FileInput,
  FileJson2,
  Layers3,
  ListChecks,
  ScrollText,
} from "lucide-react";

import type { Execution } from "@/lib/api/types";

type TraceEvent = NonNullable<Execution["steps"]>[number];

type OutputTabId = "input" | "output" | "trace" | "logs" | "error";

const TABS: { id: OutputTabId; label: string; icon: React.ReactNode }[] = [
  { id: "input", label: "Input", icon: <FileInput /> },
  { id: "output", label: "Output", icon: <FileJson2 /> },
  { id: "trace", label: "Trace", icon: <Layers3 /> },
  { id: "logs", label: "Logs", icon: <ScrollText /> },
  { id: "error", label: "Error", icon: <ListChecks /> },
];

function statusPillClass(status?: string | null): string {
  switch ((status ?? "").toUpperCase()) {
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
      return "border-slate-200 bg-slate-100 text-slate-500";
  }
}

export function ExecutionOutputPanel({
  execution,
  selectedStepId,
}: {
  execution?: Execution | null;
  selectedStepId?: string | null;
}) {
  const [activeTab, setActiveTab] = useState<OutputTabId>("trace");

  const steps = execution?.steps ?? [];
  const selectedStep =
    steps.find((step) => step.id === selectedStepId) ?? steps[0] ?? null;

  // When no step has been recorded yet the panel falls back to the
  // execution-level payloads so real data stays visible; labels reflect this.
  const scope = selectedStep ? "step" : "execution";
  const inputData = selectedStep ? selectedStep.input : (execution?.input ?? null);
  const outputData = selectedStep
    ? selectedStep.output
    : (execution?.output ?? null);
  const errorData = selectedStep
    ? selectedStep.error
    : (execution?.error ?? null);

  const duration =
    selectedStep?.duration != null
      ? `${(selectedStep.duration / 1000).toFixed(2)}s`
      : execution?.startedAt && execution?.completedAt
        ? `${(
            (new Date(execution.completedAt).getTime() -
              new Date(execution.startedAt).getTime()) /
            1000
          ).toFixed(2)}s`
        : "Unavailable";

  const headerStatus = selectedStep?.status ?? execution?.status ?? null;
  const headerTitle = selectedStep
    ? (selectedStep.node?.label ?? selectedStep.nodeId ?? "Step")
    : (execution?.workflow?.name ?? "Execution");
  const stepPosition = selectedStep
    ? `${steps.indexOf(selectedStep) + 1} of ${steps.length}`
    : null;

  return (
    <aside className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.02)]">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[11px] font-semibold text-slate-800">
              {headerTitle}
            </h3>

            <span
              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] ${statusPillClass(headerStatus)}`}
            >
              {headerStatus ? headerStatus.toLowerCase() : "unknown"}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[9px] text-slate-400">
            <span className="font-medium text-slate-500">Duration</span>
            <span>{duration}</span>

            <span className="font-medium text-slate-500">
              {selectedStep ? "Step" : "Status"}
            </span>
            <span>{stepPosition ?? execution?.status ?? "Unknown"}</span>
          </div>
        </div>
      </div>

      <div className="flex h-10 items-center border-b border-slate-200 px-2">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={active}
              className={`relative flex items-center gap-1.5 px-3 text-[9px] font-medium ${
                active
                  ? "text-blue-600"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <span className="[&>svg]:h-3 [&>svg]:w-3">{tab.icon}</span>

              {tab.label}

              {active && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 bg-blue-600" />
              )}
            </button>
          );
        })}
      </div>

      <div className="p-4">
        {activeTab === "input" && (
          <DataBlock
            data={inputData}
            emptyLabel={`No input recorded for this ${scope}.`}
          />
        )}

        {activeTab === "output" && (
          <DataBlock
            data={outputData}
            emptyLabel={`No output recorded for this ${scope}.`}
          />
        )}

        {activeTab === "trace" && (
          <TracePanel step={selectedStep} scope={scope} />
        )}

        {activeTab === "logs" && (
          <EmptyState text={`No logs recorded for this ${scope}.`} />
        )}

        {activeTab === "error" &&
          (typeof errorData === "string" && errorData.length > 0 ? (
            <pre className="min-h-[160px] overflow-auto rounded-lg border border-rose-200 bg-rose-50 p-3 font-mono text-[9px] leading-5 text-rose-700">
{errorData}
            </pre>
          ) : (
            <EmptyState text={`No error recorded for this ${scope}.`} />
          ))}
      </div>
    </aside>
  );
}

function DataBlock({
  data,
  emptyLabel,
}: {
  data: unknown;
  emptyLabel: string;
}) {
  const isEmpty =
    data == null ||
    (typeof data === "object" &&
      Object.keys(data as Record<string, unknown>).length === 0);

  if (isEmpty) {
    return <EmptyState text={emptyLabel} />;
  }

  return (
    <pre className="min-h-[160px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[9px] leading-5 text-slate-500">
{typeof data === "string" ? data : JSON.stringify(data, null, 2)}
    </pre>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[10px] text-slate-500">
      {text}
    </div>
  );
}

function TracePanel({
  step,
  scope,
}: {
  step: TraceEvent | null;
  scope: string;
}) {
  if (!step) {
    return <EmptyState text={`No trace recorded for this ${scope}.`} />;
  }

  const meta: string[] = [];
  if (step.node?.type) meta.push(step.node.type);
  if (step.status) meta.push(step.status);
  if (step.duration != null) meta.push(`${(step.duration / 1000).toFixed(2)}s`);
  if (step.startedAt)
    meta.push(`start ${new Date(step.startedAt).toLocaleTimeString()}`);
  if (step.completedAt)
    meta.push(`end ${new Date(step.completedAt).toLocaleTimeString()}`);

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] font-semibold text-slate-700">
        {step.node?.label ?? step.nodeId ?? step.id}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[8px] font-medium uppercase tracking-[0.08em] text-slate-400">
        {meta.length > 0 ? (
          meta.map((part, i) => <span key={i}>{part}</span>)
        ) : (
          <span>No timing information recorded.</span>
        )}
      </div>
    </div>
  );
}
