"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ChevronLeft,
  Database,
  Globe,
  Loader2,
  Mail,
  MessageSquare,
  Sparkles,
  Webhook,
  type LucideIcon,
} from "lucide-react";

import {
  IntegrationFormFields,
  collectDirtySecrets,
  nonSecretKeys,
} from "@/components/integrations/integration-form-fields";
import { useCreateIntegration } from "@/hooks/use-integrations";
import { ApiError } from "@/lib/api/client";
import type { IntegrationProvider } from "@/lib/api/integrations";

const PROVIDERS: {
  id: IntegrationProvider;
  name: string;
  category: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    id: "slack",
    name: "Slack",
    category: "Communication",
    description: "Send messages and notifications to Slack channels.",
    icon: MessageSquare,
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "Communication",
    description: "Send and manage email messages from workflows.",
    icon: Mail,
  },
  {
    id: "postgresql",
    name: "PostgreSQL",
    category: "Database",
    description: "Read and write data in PostgreSQL databases.",
    icon: Database,
  },
  {
    id: "http",
    name: "HTTP Request",
    category: "Developer tools",
    description: "Connect workflows to any REST API.",
    icon: Globe,
  },
  {
    id: "webhook",
    name: "Webhooks",
    category: "Developer tools",
    description: "Receive events from external systems.",
    icon: Webhook,
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "AI",
    description: "Connect to the OpenAI API with an API key.",
    icon: Sparkles,
  },
];

export function NewIntegrationForm() {
  const router = useRouter();
  const create = useCreateIntegration();

  const [selected, setSelected] = useState<IntegrationProvider | null>(null);
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const submitError =
    formError ||
    (create.error instanceof ApiError
      ? create.error.message
      : create.error
        ? "Failed to create integration."
        : "");

  async function handleSubmit() {
    if (!selected) {
      setFormError("Please select an integration provider.");
      return;
    }
    setFormError("");

    const config: Record<string, string> = {};
    for (const key of nonSecretKeys(selected)) {
      const v = values[key];
      if (typeof v === "string" && v.trim() !== "") config[key] = v;
    }
    Object.assign(config, collectDirtySecrets(values));

    try {
      await create.mutateAsync({
        provider: selected,
        name: name.trim() || undefined,
        config: Object.keys(config).length > 0 ? config : undefined,
      });
      router.push("/integrations");
    } catch {
      // Error surfaced via `create.error` / `submitError`.
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Add Integration
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Connect an external service to use in your workflows.
          </p>
        </div>
        <Link
          href="/integrations"
          className="inline-flex items-center gap-2 text-sm text-slate-500"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const Icon = provider.icon;
          const active = selected === provider.id;
          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => {
                setSelected(provider.id);
                setValues({});
                setFormError("");
                create.reset();
              }}
              className={`group flex items-start gap-4 rounded-lg border px-4 py-3 text-left transition-shadow ${
                active ? "border-blue-500 shadow-sm" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-800">
                  {provider.name}
                </h3>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {provider.category}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {provider.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <h4 className="text-sm font-semibold text-slate-800">Configuration</h4>
        <p className="mt-1 text-sm text-slate-500">
          Provide the configuration for the selected integration. Secret fields
          are encrypted before they are stored.
        </p>

        <div className="mt-4 space-y-3">
          {!selected ? (
            <p className="text-sm text-slate-400">Select a provider to configure.</p>
          ) : (
            <>
              <div className="grid gap-1.5">
                <label className="text-[10px] font-medium text-slate-500">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={create.isPending}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[11px] text-slate-700 outline-none focus:border-blue-400 disabled:bg-slate-50"
                  placeholder="Integration name (optional)"
                />
              </div>

              <IntegrationFormFields
                provider={selected}
                values={values}
                onChange={(key, value) =>
                  setValues((cur) => ({ ...cur, [key]: value }))
                }
                mode="create"
                disabled={create.isPending}
              />
            </>
          )}
        </div>
      </div>

      {submitError && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {submitError}
        </div>
      )}

      <div className="mt-6 flex items-center justify-end gap-3">
        <Link
          href="/integrations"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!selected || create.isPending}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {create.isPending ? "Adding…" : "Add Integration"}
        </button>
      </div>
    </div>
  );
}
