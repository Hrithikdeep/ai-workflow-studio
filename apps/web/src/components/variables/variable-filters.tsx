"use client";

import {
  ChevronDown,
  Search,
} from "lucide-react";

export function VariableFilters({
  search,
  onSearchChange,
  environment,
  onEnvironmentChange,
  type,
  onTypeChange,
}: {
  search?: string;
  onSearchChange?: (s: string) => void;
  environment?: string;
  onEnvironmentChange?: (e: string) => void;
  type?: string;
  onTypeChange?: (t: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 border-b border-slate-200 bg-white px-6 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-[250px] items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5">
          <Search className="h-3.5 w-3.5 text-slate-400" />

          <input
            type="text"
            placeholder="Search variables..."
            value={search ?? ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[10px] text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>

        <select
          value={environment ?? 'All'}
          onChange={(e) => onEnvironmentChange?.(e.target.value === 'All' ? '' : e.target.value)}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
        >
          <option value="All">All Environments</option>
          <option value="Production">Production</option>
          <option value="Staging">Staging</option>
          <option value="Development">Development</option>
        </select>

        <select
          value={type ?? 'All'}
          onChange={(e) => onTypeChange?.(e.target.value === 'All' ? '' : e.target.value)}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
        >
          <option value="All">All types</option>
          <option value="String">String</option>
          <option value="Number">Number</option>
          <option value="Boolean">Boolean</option>
          <option value="Secret">Secret</option>
        </select>
      </div>

      <span className="text-[9px] text-slate-400">&nbsp;</span>
    </div>
  );
}

function FilterButton({
  label,
}: {
  label: string;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
    >
      {label}

      <ChevronDown className="h-3 w-3 text-slate-400" />
    </button>
  );
}