"use client"

import { Search, Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useWorkflows } from "@/hooks/use-workflows";
import { queryKeys } from "@/lib/api/query-keys";

export function DashboardHeader() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const { isFetching } = useWorkflows();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMetaOrCtrl = event.metaKey || event.ctrlKey;

      if (isMetaOrCtrl && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleRefresh = async () => {
    // Refresh every dashboard data source: workflows + all execution queries
    // (list, status stats, failed list for Recent Errors).
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.executions.all }),
    ]);
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const query = searchValue.trim();

    if (query) {
      router.push(`/workflows?q=${encodeURIComponent(query)}`);
      return;
    }

    router.push("/workflows");
  };

  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Good morning
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Operations overview for your workflow infrastructure.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

          <input
            ref={inputRef}
            type="text"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search workflows..."
            aria-label="Search workflows"
            className="h-9 w-64 rounded-lg border border-slate-200 bg-white pl-9 pr-11 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />

          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            ⌘K
          </span>
        </form>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isFetching}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} strokeWidth={1.8} />
          Refresh
        </button>

        <button
          type="button"
          onClick={() => router.push('/workflows/new')}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:ring-offset-1"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Create Workflow
        </button>
      </div>
    </header>
  );
}