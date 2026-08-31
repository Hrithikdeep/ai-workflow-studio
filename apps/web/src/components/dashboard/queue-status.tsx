"use client";

import { Layers3 } from "lucide-react";

interface QueueMetricProps {
  value: string | number;
  label: string;
  valueClassName?: string;
}

export function QueueStatus() {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:flex xl:h-full xl:flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers3
            className="h-4 w-4 text-slate-500"
            strokeWidth={1.8}
          />

          <h2 className="text-sm font-semibold text-slate-900">
            Queue Status
          </h2>
        </div>

        <span className="text-xs text-slate-400">—</span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3">
        <QueueMetric
          value="—"
          label="Queued Jobs"
        />

        <QueueMetric
          value="—"
          label="Running Workers"
          valueClassName="text-blue-600"
        />

        <QueueMetric
          value="—"
          label="Failed Jobs"
          valueClassName="text-red-600"
        />
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 px-4 py-3">
        <p className="text-xs text-slate-500">
          No queue metrics available.
        </p>
      </div>
    </section>
  );
}

function QueueMetric({
  value,
  label,
  valueClassName = "text-slate-900",
}: QueueMetricProps) {
  return (
    <div className="border-r border-slate-200 px-4 py-4 last:border-r-0">
      <p
        className={`text-2xl font-semibold tracking-tight ${valueClassName}`}
      >
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {label}
      </p>
    </div>
  );
}