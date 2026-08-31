"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { useState } from "react";
import { VariableFilters } from "@/components/variables/variable-filters";
import { VariableTable } from "@/components/variables/variable-table";

export default function VariablesPage() {
  const [search, setSearch] = useState('')
  const [environment, setEnvironment] = useState('')
  const [type, setType] = useState('')

  return (
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-7 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Variables
            </h1>

            <p className="mt-1 text-xs text-slate-500">
              Manage values and secrets used across your workflows.
            </p>
          </div>

          <Link
            href="/variables/new"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Variable
          </Link>
        </div>
      </div>

      {/* Filters */}
      <VariableFilters
        search={search}
        onSearchChange={setSearch}
        environment={environment}
        onEnvironmentChange={setEnvironment}
        type={type}
        onTypeChange={setType}
      />

      {/* Table */}
      <main className="px-7 py-5">
        <VariableTable
          search={search}
          environment={environment}
          type={type}
        />
      </main>
    </div>
  );
}