"use client";

import {
  Eye,
  EyeOff,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { getVariables, getVariable, deleteVariable } from "@/lib/api/variables";
import { queryKeys } from "@/lib/api/query-keys";

type VariableType = "String" | "Number" | "Boolean" | "Secret";

type Variable = {
  id: string;
  name: string;
  value?: string;
  type: VariableType;
  environment: string;
  createdAt: string;
  updatedAt: string;
};

export function VariableTable({
  search,
  environment,
  type,
}: {
  search?: string;
  environment?: string;
  type?: string;
}) {
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, { visible?: boolean; fetched?: boolean; value?: string }>>({});

  const queryClient = useQueryClient();

  const { data: variables, isLoading, isError, refetch } = useQuery<Variable[], Error>({
    queryKey: ['variables', { search, environment, type }],
    queryFn: () => getVariables({ search, environment, type }),
  });

  async function revealSecret(id: string) {
    // If already fetched toggle
    if (visibleSecrets[id]?.fetched) {
      setVisibleSecrets((cur) => ({ ...cur, [id]: { ...cur[id], visible: !cur[id]?.visible } }));
      return;
    }

    try {
      const full = await getVariable(id);
      setVisibleSecrets((cur) => ({ ...cur, [id]: { visible: true, fetched: true, value: full.value } }));
    } catch (err) {
      // Do not leak secret info
      // eslint-disable-next-line no-console
      console.error('Failed to load secret value');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this variable? This action cannot be undone.')) return;

    try {
      await deleteVariable(id);
      queryClient.invalidateQueries({ queryKey: ['variables', { search, environment, type }] });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete variable', err);
      refetch();
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/70">
            <th className="px-4 py-3 text-left text-[8px] font-semibold tracking-[0.08em] text-slate-400">VARIABLE</th>
            <th className="px-4 py-3 text-left text-[8px] font-semibold tracking-[0.08em] text-slate-400">VALUE</th>
            <th className="px-4 py-3 text-left text-[8px] font-semibold tracking-[0.08em] text-slate-400">TYPE</th>
            <th className="px-4 py-3 text-left text-[8px] font-semibold tracking-[0.08em] text-slate-400">SCOPE</th>
            <th className="px-4 py-3 text-left text-[8px] font-semibold tracking-[0.08em] text-slate-400">UPDATED</th>
            <th className="w-[84px]" />
          </tr>
        </thead>

        <tbody>
          {isLoading && (
            <tr>
              <td colSpan={6} className="p-6 text-center text-sm text-slate-400">Loading variables...</td>
            </tr>
          )}

          {isError && (
            <tr>
              <td colSpan={6} className="p-6 text-center text-sm text-red-500">
                <div className="flex flex-col items-center gap-3">
                  <div>Error loading variables</div>
                  <div>
                    <button type="button" onClick={() => refetch()} className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200">Retry</button>
                  </div>
                </div>
              </td>
            </tr>
          )}

          {variables && variables.length === 0 && (
            <tr>
              <td colSpan={6} className="p-6 text-center text-sm text-slate-400">No variables found</td>
            </tr>
          )}

          {variables?.map((variable) => {
            const secret = variable.type === 'Secret';
            const vs = visibleSecrets[variable.id];

            return (
              <tr key={variable.id} className="group border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-mono text-[10px] font-semibold text-slate-700">{variable.name}</p>
                    {secret && <p className="mt-0.5 text-[8px] text-slate-400">Sensitive value</p>}
                  </div>
                </td>

                <td className="px-4 py-3">
                  <div className="flex max-w-[280px] items-center gap-2">
                    <span className="truncate font-mono text-[9px] text-slate-500">{secret && !vs?.visible ? variable.value ?? '••••••••' : (vs?.visible ? vs.value : variable.value)}</span>

                    {secret && (
                      <button type="button" aria-label={vs?.visible ? 'Hide secret' : 'Show secret'} onClick={() => revealSecret(variable.id)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-300 hover:bg-slate-100 hover:text-slate-600">
                        {vs?.visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </td>

                <td className="px-4 py-3"><TypeBadge type={variable.type} /></td>

                <td className="px-4 py-3"><span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-medium text-slate-500">{variable.environment}</span></td>

                <td className="px-4 py-3"><span className="text-[9px] text-slate-400">{new Date(variable.updatedAt).toLocaleString()}</span></td>

                <td className="px-3 py-3 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button type="button" onClick={() => (window.location.href = `/variables/${variable.id}/edit`)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>

                    <button type="button" onClick={() => handleDelete(variable.id)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>

                    <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 hover:bg-slate-100 hover:text-slate-600"><MoreHorizontal className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TypeBadge({ type }: { type: VariableType }) {
  const classes: Record<VariableType, string> = {
    String: "border-slate-200 bg-slate-50 text-slate-500",
    Number: "border-blue-200 bg-blue-50 text-blue-600",
    Boolean: "border-violet-200 bg-violet-50 text-violet-600",
    Secret: "border-amber-200 bg-amber-50 text-amber-600",
  };

  return (
    <span className={`rounded-full border px-2 py-1 text-[8px] font-semibold ${classes[type]}`}>{type}</span>
  );
}
