"use client";

import {
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Database,
  MessageSquare,
  MoreHorizontal,
  Workflow,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { useUseTemplate } from "@/hooks/use-templates";
import { ApiError } from "@/lib/api/client";
import type { Template } from "@/lib/api/templates";

export type WorkflowTemplate = Template;

type IconKey = "support" | "sales" | "ai" | "data" | "operations";

const ICONS: Record<IconKey, typeof Workflow> = {
  support: MessageSquare,
  sales: BriefcaseBusiness,
  ai: Bot,
  data: Database,
  operations: Workflow,
};

const ICON_CLASSES: Record<IconKey, string> = {
  support: "border-blue-200 bg-blue-50 text-blue-600",
  sales: "border-emerald-200 bg-emerald-50 text-emerald-600",
  ai: "border-violet-200 bg-violet-50 text-violet-600",
  data: "border-cyan-200 bg-cyan-50 text-cyan-600",
  operations: "border-amber-200 bg-amber-50 text-amber-600",
};

function iconKeyFor(category: string): IconKey {
  const key = category.trim().toLowerCase() as IconKey;
  return key in ICONS ? key : "operations";
}

export function TemplateCard({
  template,
}: {
  template: WorkflowTemplate;
}) {
  const router = useRouter();
  const useTemplate = useUseTemplate();

  const iconKey = iconKeyFor(template.category);
  const Icon = ICONS[iconKey];

  const error =
    useTemplate.isError && useTemplate.variables === template.id
      ? useTemplate.error instanceof ApiError
        ? useTemplate.error.message
        : "Could not create a workflow from this template."
      : null;

  const pending =
    useTemplate.isPending && useTemplate.variables === template.id;

  function handleUse() {
    useTemplate.mutate(template.id, {
      onSuccess: (result) => {
        router.push(`/workflows/${result.workflowId}`);
      },
    });
  }

  return (
    <article className="group rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${ICON_CLASSES[iconKey]}`}
          >
            <Icon className="h-5 w-5" strokeWidth={1.7} />
          </span>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-xs font-semibold text-slate-800">
                {template.name}
              </h3>

              {template.featured && (
                <span className="rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-wide text-violet-600">
                  Featured
                </span>
              )}
            </div>

            <p className="mt-0.5 text-[9px] text-slate-400">
              {template.category}
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-label="Template actions"
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 opacity-0 transition-opacity hover:bg-slate-50 hover:text-slate-600 group-hover:opacity-100"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-4 min-h-[34px] text-[10px] leading-4 text-slate-500">
        {template.description}
      </p>

      <div className="mt-4 flex items-center gap-4 border-t border-slate-100 pt-3">
        <span className="inline-flex items-center gap-1 text-[8px] text-slate-400">
          <Workflow className="h-3 w-3" />
          {template.nodeCount} nodes
        </span>

        <span className="inline-flex items-center gap-1 text-[8px] text-slate-400">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          {template.usageCount} uses
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1 text-[8px] ${
            error ? "text-red-500" : "text-slate-400"
          }`}
        >
          <Clock3 className="h-3 w-3" />
          {error ? error : "Ready to use"}
        </span>

        <button
          type="button"
          onClick={handleUse}
          disabled={pending}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-[9px] font-semibold text-white opacity-90 hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Using…" : "Use template"}
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>
    </article>
  );
}
