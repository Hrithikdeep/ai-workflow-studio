"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { TemplateCard } from "@/components/templates/template-card";
import { TemplateFilters } from "@/components/templates/template-filters";
import { useTemplates } from "@/hooks/use-templates";
import { ApiError } from "@/lib/api/client";

const ALL = "All templates";

export default function TemplatesPage() {
  const { data, isLoading, isError, error } = useTemplates();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);

  const templates = data ?? [];

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const t of templates) seen.add(t.category);
    return [ALL, ...Array.from(seen).sort()];
  }, [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      const matchesCategory = category === ALL || t.category === category;
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [templates, search, category]);

  const featured = filtered.filter((t) => t.featured);
  const rest = filtered.filter((t) => !t.featured);

  const errorMessage = isError
    ? error instanceof ApiError
      ? error.message
      : "Could not load templates."
    : null;

  return (
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-7 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Templates
            </h1>

            <p className="mt-1 text-xs text-slate-500">
              Start faster with pre-built workflow patterns.
            </p>
          </div>

          <Link
            href="/workflows/new"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Create from scratch
          </Link>
        </div>
      </div>

      {/* Filters */}
      <TemplateFilters
        categories={categories}
        activeCategory={category}
        onCategoryChange={setCategory}
        search={search}
        onSearchChange={setSearch}
        total={filtered.length}
      />

      {/* Featured */}
      <main className="px-7 py-5">
        {isLoading ? (
          <p className="text-xs text-slate-400">Loading templates…</p>
        ) : errorMessage ? (
          <p className="text-xs text-red-500">{errorMessage}</p>
        ) : templates.length === 0 ? (
          <p className="text-xs text-slate-400">
            No templates are available in this workspace yet.
          </p>
        ) : (
          <>
            <section>
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <h2 className="text-xs font-semibold text-slate-800">
                    Featured templates
                  </h2>

                  <p className="mt-0.5 text-[9px] text-slate-400">
                    Popular patterns to get your workflow running quickly.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {featured.length === 0 ? (
                  <p className="text-[10px] text-slate-400">
                    No featured templates match your filters.
                  </p>
                ) : (
                  featured.map((template) => (
                    <TemplateCard key={template.id} template={template} />
                  ))
                )}
              </div>
            </section>

            {/* All templates */}
            <section className="mt-7">
              <div className="mb-3">
                <h2 className="text-xs font-semibold text-slate-800">
                  All templates
                </h2>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rest.length === 0 ? (
                  <p className="text-[10px] text-slate-400">
                    No templates match your filters.
                  </p>
                ) : (
                  rest.map((template) => (
                    <TemplateCard key={template.id} template={template} />
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
