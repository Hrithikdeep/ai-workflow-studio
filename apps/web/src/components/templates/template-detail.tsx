"use client";

import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  Database,
  GitBranch,
  Globe,
  Mail,
  MessageSquare,
  Play,
  Braces,
  Sparkles,
  Webhook,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useTemplate, useUseTemplate } from "@/hooks/use-templates";
import { ApiError } from "@/lib/api/client";

const NODE_ICONS: Record<string, typeof Workflow> = {
  MANUAL_TRIGGER: Play,
  WEBHOOK: Webhook,
  HTTP_REQUEST: Globe,
  CONDITION: GitBranch,
  JSON_TRANSFORM: Braces,
  AI_PROMPT: Bot,
  AI_AGENT: Bot,
  STRUCTURED_EXTRACT: Braces,
  GMAIL: Mail,
  SLACK: MessageSquare,
  POSTGRES: Database,
  OUTPUT: Check,
};

export function TemplateDetail({
  templateId,
}: {
  templateId: string;
}) {
  const router = useRouter();
  const { data: template, isLoading, isError, error } = useTemplate(templateId);
  const useTemplateMutation = useUseTemplate();

  const loadError = isError
    ? error instanceof ApiError
      ? error.message
      : "Could not load this template."
    : null;

  const useError = useTemplateMutation.isError
    ? useTemplateMutation.error instanceof ApiError
      ? useTemplateMutation.error.message
      : "Could not create a workflow from this template."
    : null;

  function handleUse() {
    if (!template) return;
    useTemplateMutation.mutate(template.id, {
      onSuccess: (result) => router.push(`/workflows/${result.workflowId}`),
    });
  }

  const pending = useTemplateMutation.isPending;

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/templates"
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Templates
          </Link>

          <button
            type="button"
            onClick={handleUse}
            disabled={pending || !template}
            className="inline-flex h-8 items-center gap-2 rounded-md bg-blue-600 px-3 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Using…" : "Use template"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {isLoading ? (
          <p className="text-xs text-slate-400">Loading template…</p>
        ) : loadError || !template ? (
          <p className="text-xs text-red-500">
            {loadError ?? "Template not found."}
          </p>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600">
                  <Sparkles className="h-6 w-6" />
                </div>

                <div>
                  <h1 className="text-xl font-semibold text-slate-900">
                    {template.name}
                  </h1>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {template.description}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <InfoCard label="Nodes" value={`${template.nodeCount}`} />

                <InfoCard label="Category" value={template.category} />

                <InfoCard label="Usage" value={`${template.usageCount}`} />
              </div>

              {useError && (
                <p className="mt-4 text-[10px] font-medium text-red-500">
                  {useError}
                </p>
              )}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
              <section className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h2 className="text-xs font-semibold text-slate-800">
                    Workflow structure
                  </h2>

                  <p className="mt-1 text-[9px] text-slate-400">
                    Preview of the nodes included in this template.
                  </p>
                </div>

                <div className="p-5">
                  <WorkflowPreview
                    nodes={template.nodePreview}
                  />
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-xs font-semibold text-slate-800">
                  Included capabilities
                </h2>

                <div className="mt-4 space-y-3">
                  {template.capabilities.length === 0 ? (
                    <p className="text-[10px] text-slate-400">
                      No capabilities detected in this template.
                    </p>
                  ) : (
                    template.capabilities.map((text) => (
                      <Capability key={text} text={text} />
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleUse}
                  disabled={pending}
                  className="mt-5 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {pending ? "Using…" : "Use this template"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function WorkflowPreview({
  nodes,
}: {
  nodes: Array<{ label: string; type: string }>;
}) {
  if (nodes.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-center text-[10px] text-slate-400">
        This template&apos;s source workflow has no nodes yet.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
      <div className="mx-auto max-w-[300px] space-y-2">
        {nodes.map((node, index) => {
          const Icon = NODE_ICONS[node.type] ?? Workflow;

          return (
            <div key={`${node.label}-${index}`}>
              <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500">
                  <Icon className="h-3.5 w-3.5" />
                </span>

                <span className="text-[10px] font-semibold text-slate-700">
                  {node.label}
                </span>
              </div>

              {index !== nodes.length - 1 && (
                <div className="mx-auto h-2 w-px bg-slate-300" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Capability({
  text,
}: {
  text: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <Check className="h-3 w-3" />
      </span>

      <span className="text-[10px] text-slate-600">
        {text}
      </span>
    </div>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>

      <p className="mt-1.5 text-xs font-semibold text-slate-800">
        {value}
      </p>
    </div>
  );
}
