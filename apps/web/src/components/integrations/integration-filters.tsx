"use client";

import { ChevronDown, Search } from "lucide-react";

export type IntegrationStatusFilter = "all" | "connected" | "available" | "error";

type IntegrationFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  status: IntegrationStatusFilter;
  onStatusChange: (value: IntegrationStatusFilter) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  categories: string[];
  count: number;
};

const STATUS_LABELS: Record<IntegrationStatusFilter, string> = {
  all: "All statuses",
  connected: "Connected",
  available: "Not tested",
  error: "Connection error",
};

export function IntegrationFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  category,
  onCategoryChange,
  categories,
  count,
}: IntegrationFiltersProps) {
  return (
    <div className="flex flex-col gap-2.5 border-b border-slate-200 bg-white px-6 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 w-[250px] items-center gap-2 rounded-md border border-slate-200 px-2.5">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name or provider..."
            className="min-w-0 flex-1 bg-transparent text-[10px] text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>

        <SelectFilter
          value={category}
          onChange={onCategoryChange}
          options={[
            { value: "", label: "All categories" },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
        />

        <SelectFilter
          value={status}
          onChange={(v) => onStatusChange(v as IntegrationStatusFilter)}
          options={(
            ["all", "connected", "available", "error"] as IntegrationStatusFilter[]
          ).map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
        />
      </div>

      <span className="text-[9px] text-slate-400">
        {count} {count === 1 ? "integration" : "integrations"}
      </span>
    </div>
  );
}

function SelectFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative inline-flex h-8 items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none rounded-md border border-slate-200 bg-white pl-2.5 pr-7 text-[10px] font-medium text-slate-600 outline-none hover:bg-slate-50 focus:border-blue-400"
      >
        {options.map((opt) => (
          <option key={opt.value || "any"} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-slate-400" />
    </div>
  );
}
