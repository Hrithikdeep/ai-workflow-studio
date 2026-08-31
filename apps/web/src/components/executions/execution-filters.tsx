"use client";

import { useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

export type ExecutionStatusFilter =
  | "all"
  | "running"
  | "success"
  | "failed";

export type ExecutionDateRange = "all" | "24h" | "7d" | "30d";

type ExecutionFilterBarProps = {
  activeStatus: ExecutionStatusFilter;
  onStatusChange: (status: ExecutionStatusFilter) => void;

  search: string;
  onSearchChange: (value: string) => void;

  workflowId: string;
  onWorkflowChange: (id: string) => void;
  workflowOptions: { id: string; name: string }[];

  trigger: string;
  onTriggerChange: (trigger: string) => void;
  triggerOptions: string[];

  dateRange: ExecutionDateRange;
  onDateRangeChange: (range: ExecutionDateRange) => void;

  count: number;
};

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "success", label: "Success" },
  { id: "failed", label: "Failed" },
] as const;

const DATE_OPTIONS: { value: ExecutionDateRange; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function titleCaseTrigger(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

export function ExecutionFilters({
  activeStatus,
  onStatusChange,
  search,
  onSearchChange,
  workflowId,
  onWorkflowChange,
  workflowOptions,
  trigger,
  onTriggerChange,
  triggerOptions,
  dateRange,
  onDateRangeChange,
  count,
}: ExecutionFilterBarProps) {
  return (
    <div className="flex flex-col gap-2.5 border-b border-slate-200 bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      {/* flex-wrap (not overflow-x-auto) so the Workflow/Trigger/Date dropdown
          menus are not clipped by a scroll container. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 items-center rounded-md border border-slate-200 bg-white p-0.5">
          {STATUS_TABS.map((tab) => {
            const active = activeStatus === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onStatusChange(tab.id)}
                className={`rounded px-3 py-1.5 text-[10px] font-medium transition-colors ${
                  active
                    ? "bg-slate-100 text-slate-800"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex h-8 min-w-[190px] items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5">
          <Search className="h-3.5 w-3.5 text-slate-400" />

          <input
            type="text"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search execution or workflow..."
            className="min-w-0 flex-1 bg-transparent text-[10px] text-slate-700 outline-none placeholder:text-slate-400"
          />

          {search !== "" && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <FilterMenu
          label="Workflow"
          value={workflowId}
          options={[
            { value: "", label: "All workflows" },
            ...workflowOptions.map((w) => ({ value: w.id, label: w.name })),
          ]}
          onSelect={onWorkflowChange}
        />

        <FilterMenu
          label="Trigger"
          value={trigger}
          options={[
            { value: "", label: "All triggers" },
            ...triggerOptions.map((t) => ({
              value: t,
              label: titleCaseTrigger(t),
            })),
          ]}
          onSelect={onTriggerChange}
        />

        <FilterMenu
          label="Date"
          value={dateRange === "all" ? "" : dateRange}
          icon={<CalendarDays />}
          options={DATE_OPTIONS.map((o) => ({
            value: o.value === "all" ? "" : o.value,
            label: o.label,
          }))}
          onSelect={(v) =>
            onDateRangeChange((v || "all") as ExecutionDateRange)
          }
        />
      </div>

      <div className="hidden items-center gap-1 text-[9px] text-slate-400 lg:flex">
        <SlidersHorizontal className="h-3 w-3" />
        {count} execution{count === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function FilterMenu({
  label,
  value,
  options,
  onSelect,
  icon,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value && o.value !== "");
  const display = selected ? selected.label : label;
  const isActive = value !== "";

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-medium transition-colors ${
          isActive
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        {icon ? (
          <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
        ) : null}

        <span className="max-w-[140px] truncate">{display}</span>

        <ChevronDown className="h-3 w-3 text-slate-400" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />

          <div className="absolute left-0 z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
            {options.map((option) => (
              <button
                key={option.value || "__all"}
                type="button"
                onClick={() => {
                  onSelect(option.value);
                  setOpen(false);
                }}
                className={`block w-full truncate px-3 py-1.5 text-left text-[10px] transition-colors ${
                  option.value === value
                    ? "bg-slate-100 font-medium text-slate-800"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
