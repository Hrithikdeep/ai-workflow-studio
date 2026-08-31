"use client";

import {
  ChevronDown,
  Search,
} from "lucide-react";

type TemplateFiltersProps = {
  categories?: string[];
  activeCategory?: string;
  onCategoryChange?: (category: string) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  total?: number;
};

export function TemplateFilters({
  categories = ["All templates"],
  activeCategory = "All templates",
  onCategoryChange,
  search = "",
  onSearchChange,
  total,
}: TemplateFiltersProps) {
  return (
    <div className="border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 overflow-x-auto">
          <div className="flex h-8 w-[250px] shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5">
            <Search className="h-3.5 w-3.5 text-slate-400" />

            <input
              type="text"
              value={search}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder="Search templates..."
              className="min-w-0 flex-1 bg-transparent text-[10px] text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="flex shrink-0 items-center rounded-md border border-slate-200 bg-white p-0.5">
            {categories.slice(0, 4).map((category) => {
              const active = activeCategory === category;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => onCategoryChange?.(category)}
                  className={`rounded px-2.5 py-1.5 text-[9px] font-medium ${
                    active
                      ? "bg-slate-100 text-slate-800"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
          >
            More categories
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </button>
        </div>

        <span className="text-[9px] text-slate-400">
          {typeof total === "number"
            ? `${total} template${total === 1 ? "" : "s"}`
            : ""}
        </span>
      </div>
    </div>
  );
}
