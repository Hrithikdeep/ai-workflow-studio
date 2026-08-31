"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plug, Plus } from "lucide-react";

import {
  IntegrationCard,
  type IntegrationCardData,
} from "@/components/integrations/integration-card";
import {
  IntegrationFilters,
  type IntegrationStatusFilter,
} from "@/components/integrations/integration-filters";
import { useIntegrations } from "@/hooks/use-integrations";
import { ApiError } from "@/lib/api/client";
import type { Integration } from "@/lib/api/integrations";

const PROVIDER_META: Record<
  string,
  { category: string; description: string }
> = {
  slack: {
    category: "Communication",
    description: "Send messages and notifications to Slack channels.",
  },
  gmail: {
    category: "Communication",
    description: "Send and manage email messages from workflows.",
  },
  postgresql: {
    category: "Database",
    description: "Read and write data in PostgreSQL databases.",
  },
  http: {
    category: "Developer tools",
    description: "Connect workflows to any REST API.",
  },
  webhook: {
    category: "Developer tools",
    description: "Receive events from external systems.",
  },
  openai: {
    category: "AI",
    description: "Connect to the OpenAI API with an API key.",
  },
};

const CATEGORIES = ["Communication", "Database", "Developer tools", "AI"];

function toCardData(row: Integration): IntegrationCardData {
  const meta = PROVIDER_META[row.provider];
  const description =
    typeof row.config?.description === "string" && row.config.description
      ? row.config.description
      : (meta?.description ?? "");
  const category =
    typeof row.config?.category === "string" && row.config.category
      ? row.config.category
      : (meta?.category ?? row.provider);

  return {
    id: row.id,
    name: row.name,
    description,
    category,
    status: row.status,
    provider: row.provider,
  };
}

export default function IntegrationsPage() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useIntegrations();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<IntegrationStatusFilter>("all");
  const [category, setCategory] = useState("");

  const cards = useMemo(() => (data ?? []).map(toCardData), [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (category && c.category !== category) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.provider.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
      );
    });
  }, [cards, search, status, category]);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-7 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Integrations
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Connect external services to your workflows.
            </p>
          </div>

          <Link
            href="/integrations/new"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Integration
          </Link>
        </div>
      </div>

      <IntegrationFilters
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        category={category}
        onCategoryChange={setCategory}
        categories={CATEGORIES}
        count={filtered.length}
      />

      <main className="px-7 py-5">
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[168px] animate-pulse rounded-xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-6 text-center">
            <p className="text-sm font-medium text-red-600">
              {error instanceof ApiError
                ? error.message
                : "Could not load integrations."}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-3 inline-flex items-center rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Retry
            </button>
          </div>
        ) : cards.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-xs text-slate-400">
            No integrations match your filters.
          </p>
        ) : (
          <div
            className={`grid gap-3 md:grid-cols-2 xl:grid-cols-3 ${
              isFetching ? "opacity-70" : ""
            }`}
          >
            {filtered.map((integration) => (
              <IntegrationCard key={integration.id} integration={integration} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
        <Plug className="h-5 w-5 text-slate-400" strokeWidth={1.7} />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-800">
        No integrations yet
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
        Connect Slack, Gmail, PostgreSQL, an HTTP API, or a webhook so your
        workflows can talk to them.
      </p>
      <Link
        href="/integrations/new"
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Integration
      </Link>
    </div>
  );
}
