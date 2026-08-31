"use client";

import Link from "next/link";

import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Database,
  Globe,
  KeyRound,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Sparkles,
  Webhook,
} from "lucide-react";

export type IntegrationCardStatus = "connected" | "available" | "error";

export type IntegrationCardData = {
  id: string;
  name: string;
  description: string;
  category: string;
  status: IntegrationCardStatus;
  provider: "slack" | "gmail" | "postgresql" | "webhook" | "http" | "openai";
};

const ICONS = {
  slack: MessageSquare,
  gmail: Mail,
  postgresql: Database,
  webhook: Webhook,
  http: Globe,
  openai: Sparkles,
};

export function IntegrationCard({
  integration,
}: {
  integration: IntegrationCardData;
}) {
  const Icon = ICONS[integration.provider] ?? Globe;
  const connected = integration.status === "connected";
  const errored = integration.status === "error";

  return (
    <div className="group rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
            <Icon className="h-5 w-5" strokeWidth={1.7} />
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-800">
              {integration.name}
            </h3>

            <span className="mt-0.5 block text-[9px] text-slate-400">
              {integration.category}
            </span>
          </div>
        </div>

        <button
          type="button"
          aria-label="Integration actions"
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 opacity-0 transition-opacity hover:bg-slate-50 hover:text-slate-600 group-hover:opacity-100"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-4 line-clamp-2 text-[10px] leading-4 text-slate-500">
        {integration.description}
      </p>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        {connected ? (
          <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Connected
          </span>
        ) : errored ? (
          <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-red-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            Connection error
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[9px] font-medium text-slate-400">
            <KeyRound className="h-3.5 w-3.5" />
            Not tested
          </span>
        )}

        <Link
          href={`/integrations/${integration.id}`}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[9px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          Manage
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
