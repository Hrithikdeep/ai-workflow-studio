"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Globe,
  KeyRound,
  Loader2,
  Mail,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Trash2,
  Webhook,
  type LucideIcon,
} from "lucide-react";

import {
  IntegrationFormFields,
  collectDirtySecrets,
  nonSecretKeys,
} from "@/components/integrations/integration-form-fields";
import { TestConnectionButton } from "@/components/integrations/test-connection-button";
import {
  useDeleteIntegration,
  useIntegration,
  useUpdateIntegration,
} from "@/hooks/use-integrations";
import { ApiError } from "@/lib/api/client";
import type {
  Integration,
  IntegrationProvider,
  IntegrationStatus,
} from "@/lib/api/integrations";

const PRESENTATION: Record<
  IntegrationProvider,
  { icon: LucideIcon; label: string; category: string; blurb: string }
> = {
  slack: {
    icon: MessageSquare,
    label: "Slack",
    category: "Communication",
    blurb: "Send messages and notifications to Slack channels from your workflows.",
  },
  gmail: {
    icon: Mail,
    label: "Gmail",
    category: "Communication",
    blurb: "Send and manage email messages from your workflow automations.",
  },
  postgresql: {
    icon: Database,
    label: "PostgreSQL",
    category: "Database",
    blurb: "Read and write rows in PostgreSQL databases from workflow nodes.",
  },
  http: {
    icon: Globe,
    label: "HTTP Request",
    category: "Developer tools",
    blurb: "Connect your workflows to external REST APIs and services.",
  },
  webhook: {
    icon: Webhook,
    label: "Webhooks",
    category: "Developer tools",
    blurb: "Receive events from external systems through HTTP webhook endpoints.",
  },
  openai: {
    icon: Sparkles,
    label: "OpenAI",
    category: "AI",
    blurb:
      "Store an OpenAI API key so it can be verified and used by future workflow steps.",
  },
};

const STATUS_PILL: Record<IntegrationStatus, string> = {
  connected: "border-emerald-200 bg-emerald-50 text-emerald-600",
  error: "border-red-200 bg-red-50 text-red-600",
  available: "border-slate-200 bg-slate-50 text-slate-500",
};

const STATUS_TEXT: Record<IntegrationStatus, string> = {
  connected: "Connected",
  error: "Connection error",
  available: "Not tested",
};

function configToFormValues(
  config: Integration["config"],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(config ?? {})) {
    if (value === null || value === undefined) continue;
    out[key] = String(value);
  }
  return out;
}

export function IntegrationDetail({
  integrationId,
}: {
  integrationId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isLoading, isError, error, refetch } =
    useIntegration(integrationId);
  const update = useUpdateIntegration();
  const remove = useDeleteIntegration();

  const gmailParam = searchParams.get("gmail");
  const gmailReason = searchParams.get("reason");

  // After returning from Google's OAuth flow, re-read the integration.
  useEffect(() => {
    if (gmailParam === "connected") {
      void refetch();
    }
  }, [gmailParam, refetch]);

  const apiBase = (
    process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:3001"
  ).replace(/\/+$/, "");

  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [snapshot, setSnapshot] = useState<{
    name: string;
    values: Record<string, string>;
  } | null>(null);
  const seededId = useRef<string | null>(null);

  useEffect(() => {
    if (!data) return;
    if (seededId.current === data.id) return;
    seededId.current = data.id;
    const seededValues = configToFormValues(data.config);
    setName(data.name);
    setValues(seededValues);
    setSnapshot({ name: data.name, values: seededValues });
  }, [data]);

  const isDirty = useMemo(() => {
    if (!snapshot) return false;
    if (name !== snapshot.name) return true;
    return JSON.stringify(values) !== JSON.stringify(snapshot.values);
  }, [name, values, snapshot]);

  if (isLoading) {
    return (
      <div className="min-h-full bg-slate-50 px-6 py-8">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="h-16 animate-pulse rounded-xl border border-slate-200 bg-white" />
          <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="min-h-full bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-slate-800">
            {notFound
              ? "Integration not found"
              : "Could not load this integration"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {notFound
              ? "It may have been deleted, or it belongs to a different workspace."
              : error instanceof ApiError
                ? error.message
                : "Please try again."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/integrations")}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to integrations
            </button>
            {!notFound && (
              <button
                type="button"
                onClick={() => refetch()}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const presentation = PRESENTATION[data.provider];
  const Icon = presentation?.icon ?? Globe;

  const handleSave = async () => {
    const config: Record<string, string> = {};
    for (const key of nonSecretKeys(data.provider)) {
      const v = values[key];
      if (typeof v === "string" && v.trim() !== "") config[key] = v;
    }
    Object.assign(config, collectDirtySecrets(values));

    const updated = await update.mutateAsync({
      id: data.id,
      input: { name: name.trim() || data.name, config },
    });

    const nextValues = configToFormValues(updated.config);
    setName(updated.name);
    setValues(nextValues);
    setSnapshot({ name: updated.name, values: nextValues });
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Delete "${data.name}"? This removes the integration and its stored credential. This cannot be undone.`,
      )
    ) {
      return;
    }
    await remove.mutateAsync(data.id);
    router.push("/integrations");
  };

  const saveError =
    update.error instanceof ApiError
      ? update.error.message
      : update.error
        ? "Could not save changes."
        : null;
  const deleteError =
    remove.error instanceof ApiError
      ? remove.error.message
      : remove.error
        ? "Could not delete this integration."
        : null;

  return (
    <div className="min-h-full bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/integrations")}
            aria-label="Back to integrations"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="h-5 w-px bg-slate-200" />

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
            <Icon className="h-5 w-5 text-slate-600" strokeWidth={1.7} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-slate-900">
                {data.name}
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-semibold ${STATUS_PILL[data.status]}`}
              >
                {STATUS_TEXT[data.status]}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-400">
              {presentation?.label ?? data.provider} ·{" "}
              {presentation?.category ?? "Integration"}
            </p>
          </div>
        </div>

        <p className="ml-[92px] mt-3 max-w-2xl text-xs leading-5 text-slate-500">
          {presentation?.blurb}
        </p>
      </div>

      {gmailParam === "connected" && (
        <div className="mx-auto max-w-5xl px-6 pt-4">
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Gmail connected. You can now test the connection and use it in workflows.
          </div>
        </div>
      )}
      {gmailParam === "error" && (
        <div className="mx-auto max-w-5xl px-6 pt-4">
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">
            Gmail connection did not complete
            {gmailReason ? ` (${gmailReason})` : ""}. Please try connecting again.
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-5xl gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1.5fr)_320px]">
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white">
            <SectionHeader
              title="Configuration"
              description="Settings used when workflow nodes call this integration."
            />
            <div className="space-y-4 p-5">
              <div className="grid gap-1.5">
                <label className="text-[10px] font-medium text-slate-500">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={update.isPending}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[11px] text-slate-700 outline-none focus:border-blue-400 disabled:bg-slate-50"
                />
              </div>

              <IntegrationFormFields
                provider={data.provider}
                values={values}
                onChange={(key, value) =>
                  setValues((cur) => ({ ...cur, [key]: value }))
                }
                mode="edit"
                hasCredential={data.hasCredential}
                disabled={update.isPending}
              />

              {saveError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-600">
                  {saveError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                {update.isSuccess && !isDirty && (
                  <span className="text-[10px] text-emerald-600">Saved</span>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!isDirty || update.isPending}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {update.isPending && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {update.isPending ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white">
            <SectionHeader
              title="Credential"
              description="Secrets are encrypted at rest and never returned by the API."
            />
            <div className="p-5">
              {data.provider === "gmail" ? (
                <GmailCredentialPanel
                  integrationId={data.id}
                  account={
                    typeof data.config?.account === "string"
                      ? data.config.account
                      : null
                  }
                  connected={data.status === "connected"}
                  apiBase={apiBase}
                />
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-slate-700">
                      {data.hasCredential
                        ? "Credential configured"
                        : "No credential stored"}
                    </p>
                    <p className="mt-0.5 text-[9px] text-slate-400">
                      {data.hasCredential
                        ? "Enter a new value in the form above and save to replace it. Leaving secret fields blank keeps it."
                        : "Add a secret in the form above and save to store it securely."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <h2 className="text-xs font-semibold text-slate-800">Connection</h2>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[9px] uppercase tracking-[0.08em] text-slate-400">
                Status
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {STATUS_TEXT[data.status]}
              </p>
            </div>

            <div className="mt-3">
              <TestConnectionButton integrationId={data.id} />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-xs font-semibold text-slate-800">Danger zone</h2>
            <p className="mt-1 text-[10px] leading-4 text-slate-400">
              Deleting removes this integration and its stored credential.
            </p>
            {deleteError && (
              <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10px] text-red-600">
                {deleteError}
              </p>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={remove.isPending}
              className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-red-200 bg-white text-[10px] font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {remove.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              {remove.isPending ? "Deleting…" : "Delete integration"}
            </button>
          </section>
        </aside>
      </main>
    </div>
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-slate-200 px-5 py-3.5">
      <h2 className="text-xs font-semibold text-slate-800">{title}</h2>
      <p className="mt-0.5 text-[9px] text-slate-400">{description}</p>
    </div>
  );
}

function GmailCredentialPanel({
  integrationId,
  account,
  connected,
  apiBase,
}: {
  integrationId: string;
  account: string | null;
  connected: boolean;
  apiBase: string;
}) {
  const startUrl = `${apiBase}/integrations/gmail/oauth/start?integrationId=${encodeURIComponent(
    integrationId,
  )}&redirectTo=${encodeURIComponent(`/integrations/${integrationId}`)}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400">
          <Mail className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-slate-700">
            {connected ? "Connected with Google" : "Not connected"}
          </p>
          <p className="mt-0.5 truncate text-[9px] text-slate-400">
            {connected && account
              ? `Authorized account: ${account}`
              : "Grant send access through Google OAuth. No password is stored."}
          </p>
        </div>
      </div>

      <a
        href={startUrl}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-[10px] font-semibold text-white hover:bg-blue-700"
      >
        {connected ? "Reconnect Gmail with Google" : "Connect Gmail with Google"}
      </a>
    </div>
  );
}
