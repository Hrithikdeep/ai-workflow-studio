"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  KeyRound,
  MoreHorizontal,
  Plus,
  RotateCcw,
  ShieldCheck,
  Terminal,
  Trash2,
} from "lucide-react";

import { useEffect, useRef, useState } from "react";

import {
  useApiKeys,
  useCreateApiKey,
  useRevokeAllApiKeys,
  useRevokeApiKey,
} from "@/hooks/use-api-keys";
import { ApiError } from "@/lib/api/client";
import type { ApiKeyMeta } from "@/lib/api/api-keys";

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
}

export function ApiDeveloperSettings() {
  const keysQuery = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const revokeAll = useRevokeAllApiKeys();

  const keys = keysQuery.data ?? [];
  const activeKeys = keys.filter((k) => k.status === "Active");

  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [revealed, setRevealed] = useState<{ name: string; key: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    setError(null);
    setRevealed(null);
    createKey.mutate(
      { name: newKeyName.trim() },
      {
        onSuccess: (created) => {
          setRevealed({ name: created.name, key: created.key });
          setNewKeyName("");
          setCreateOpen(false);
        },
        onError: (e) =>
          setError(
            e instanceof ApiError ? e.message : "Could not create the API key.",
          ),
      },
    );
  }

  const loadError = keysQuery.isError ? "Could not load API keys." : null;

  return (
    <div className="space-y-4">
      {/* Header / overview */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-600">
              <Terminal className="h-4 w-4" />
            </div>

            <div>
              <h2 className="text-xs font-semibold text-slate-800">
                API & Developer
              </h2>

              <p className="mt-1 max-w-xl text-[9px] leading-4 text-slate-400">
                Manage API keys, webhook signing, and developer settings for this workspace.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <DeveloperStatus
            label="API access"
            value="Enabled"
            positive
          />

          <DeveloperStatus
            label="Active keys"
            value={keysQuery.isLoading ? "…" : `${activeKeys.length}`}
            positive
          />

          <DeveloperStatus
            label="Webhook signing"
            value="Per workflow"
            positive
          />
        </div>
      </section>

      {/* API Keys */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xs font-semibold text-slate-800">
              API keys
            </h2>

            <p className="mt-1 text-[9px] text-slate-400">
              Keys used by external services to access Relay APIs.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCreateOpen((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[10px] font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Create API key
          </button>
        </div>

        {createOpen && (
          <div className="flex flex-col gap-2.5 border-b border-slate-200 px-5 py-3 sm:flex-row sm:items-center">
            <input
              type="text"
              value={newKeyName}
              onChange={(event) => setNewKeyName(event.target.value)}
              placeholder="Key name (e.g. CI pipeline)"
              className="h-8 flex-1 rounded-md border border-slate-200 px-2.5 text-[10px] text-slate-700 outline-none focus:border-blue-400"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={createKey.isPending || !newKeyName.trim()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createKey.isPending ? "Creating…" : "Create key"}
            </button>
          </div>
        )}

        {revealed && (
          <div className="flex items-start gap-3 border-b border-slate-200 bg-amber-50/60 px-5 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-amber-600 shadow-sm">
              <KeyRound className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-700">
                “{revealed.name}” created — copy it now
              </p>
              <p className="mt-0.5 text-[8px] leading-4 text-slate-500">
                This is the only time the full key is shown.
              </p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <code className="truncate rounded bg-white px-2 py-1 font-mono text-[8px] text-slate-700">
                  {revealed.key}
                </code>
                <RevealCopyButton value={revealed.key} />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRevealed(null)}
              className="text-[9px] font-semibold text-slate-500 hover:text-slate-700"
            >
              Dismiss
            </button>
          </div>
        )}

        {(error || loadError) && (
          <div className="border-b border-slate-200 px-5 py-2.5 text-[9px] font-medium text-red-500">
            {error || loadError}
          </div>
        )}

        <div className="divide-y divide-slate-100">
          {keysQuery.isLoading ? (
            <div className="px-5 py-4 text-[9px] text-slate-400">
              Loading API keys…
            </div>
          ) : keys.length === 0 ? (
            <div className="px-5 py-4 text-[9px] text-slate-400">
              No API keys yet.
            </div>
          ) : (
            keys.map((apiKey) => (
              <ApiKeyRow
                key={apiKey.id}
                apiKey={apiKey}
                busy={revokeKey.isPending}
                onRevoke={() =>
                  revokeKey.mutate(apiKey.id, {
                    onError: (e) =>
                      setError(
                        e instanceof ApiError
                          ? e.message
                          : "Could not revoke the key.",
                      ),
                  })
                }
              />
            ))
          )}
        </div>
      </section>

      {/* Webhooks */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <SectionHeader
          title="Webhook security"
          description="Protect inbound webhook requests with a signing secret."
        />

        <div className="space-y-4 p-5">
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-emerald-600 shadow-sm">
              <ShieldCheck className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-700">
                Signing secret enabled
              </p>

              <p className="mt-0.5 text-[8px] leading-4 text-slate-400">
                Webhook signing secrets are managed per workflow, from each workflow&apos;s Webhook settings.
              </p>
            </div>

            <button
              type="button"
              disabled
              className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[9px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Rotate
            </button>
          </div>

          <Field
            label="Signing algorithm"
            description="Algorithm used to verify incoming webhook signatures. Not configurable."
          >
            <div className="relative">
              <select
                value="HMAC SHA-256"
                disabled
                onChange={() => undefined}
                className="h-9 w-full appearance-none rounded-md border border-slate-200 bg-white px-3 pr-8 text-[10px] text-slate-700 outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option>HMAC SHA-256</option>
                <option>HMAC SHA-512</option>
              </select>

              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            </div>
          </Field>
        </div>
      </section>

      {/* Developer settings */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <SectionHeader
          title="Developer settings"
          description="Options that affect local development and API behavior."
        />

        <div className="divide-y divide-slate-100">
          <DeveloperRow
            icon={<KeyRound />}
            title="API access"
            description="API access is enabled whenever at least one active key exists."
            action={<Toggle enabled={activeKeys.length > 0} disabled />}
          />

          <DeveloperRow
            icon={<Terminal />}
            title="Development environment"
            description="Use development credentials and test endpoints. Not available yet."
            action={<Toggle enabled={false} disabled />}
          />

          <DeveloperRow
            icon={<RotateCcw />}
            title="Automatic key rotation"
            description="Rotate inactive development keys automatically. Not available yet."
            action={<Toggle enabled={false} disabled />}
          />
        </div>
      </section>

      {/* Documentation */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400">
            <ExternalLink className="h-3.5 w-3.5" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-700">
              Developer documentation
            </p>

            <p className="mt-0.5 text-[8px] leading-4 text-slate-400">
              Authenticate API requests by sending your key in the <code>X-API-Key</code> header.
            </p>
          </div>

          <button
            type="button"
            disabled
            className="text-[9px] font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            Open docs
          </button>
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-red-200 bg-red-50/40">
        <div className="border-b border-red-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />

            <h2 className="text-xs font-semibold text-red-700">
              Danger zone
            </h2>
          </div>

          <p className="mt-1 text-[9px] text-red-500/80">
            Revoking keys immediately invalidates their access.
          </p>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold text-slate-700">
              Revoke all API keys
            </p>

            <p className="mt-0.5 text-[9px] text-slate-400">
              Remove access for every active key in this workspace.
            </p>
          </div>

          <button
            type="button"
            onClick={() => revokeAll.mutate()}
            disabled={revokeAll.isPending || activeKeys.length === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-[9px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {revokeAll.isPending ? "Revoking…" : "Revoke all"}
          </button>
        </div>
      </section>
    </div>
  );
}

function RevealCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy API key"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-300 hover:bg-slate-100 hover:text-slate-600"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* API key row                                                                 */
/* -------------------------------------------------------------------------- */

function ApiKeyRow({
  apiKey,
  busy,
  onRevoke,
}: {
  apiKey: ApiKeyMeta;
  busy: boolean;
  onRevoke: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handle(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(apiKey.maskedKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const revoked = apiKey.status === "Revoked";

  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400">
        <KeyRound className="h-3.5 w-3.5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold text-slate-700">
            {apiKey.name}
          </p>

          <span
            className={`rounded-full border px-1.5 py-0.5 text-[7px] font-semibold ${
              revoked
                ? "border-slate-200 bg-slate-50 text-slate-400"
                : "border-emerald-200 bg-emerald-50 text-emerald-600"
            }`}
          >
            {apiKey.status}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-1.5">
          <code className="truncate font-mono text-[8px] text-slate-400">
            {apiKey.maskedKey}
          </code>

          <button
            type="button"
            aria-label="Copy API key"
            onClick={copyKey}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-300 hover:bg-slate-100 hover:text-slate-600"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 sm:flex sm:items-center">
        <div>
          <p className="text-[8px] uppercase tracking-[0.08em] text-slate-400">
            Created
          </p>

          <p className="mt-1 text-[9px] text-slate-500">
            {formatDate(apiKey.createdAt)}
          </p>
        </div>

        <div>
          <p className="text-[8px] uppercase tracking-[0.08em] text-slate-400">
            Last used
          </p>

          <p className="mt-1 text-[9px] text-slate-500">
            {apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : "Never"}
          </p>
        </div>
      </div>

      <div ref={wrapRef} className="relative">
        <button
          ref={menuRef}
          type="button"
          aria-label={`Actions for ${apiKey.name}`}
          onClick={() => !revoked && setOpen((v) => !v)}
          disabled={revoked || busy}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-300 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        {open && !revoked && (
          <div className="absolute right-0 top-full z-30 mt-1 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-lg">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRevoke();
              }}
              className="block w-full px-3 py-1.5 text-left text-[10px] text-red-600 hover:bg-red-50"
            >
              Revoke key
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Developer status                                                            */
/* -------------------------------------------------------------------------- */

function DeveloperStatus({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            positive ? "bg-emerald-500" : "bg-amber-500"
          }`}
        />

        <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          {label}
        </span>
      </div>

      <p className="mt-2 text-xs font-semibold text-slate-800">
        {value}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Section header                                                              */
/* -------------------------------------------------------------------------- */

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-slate-200 px-5 py-4">
      <h2 className="text-xs font-semibold text-slate-800">
        {title}
      </h2>

      <p className="mt-1 text-[9px] leading-4 text-slate-400">
        {description}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Developer row                                                               */
/* -------------------------------------------------------------------------- */

function DeveloperRow({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400 [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold text-slate-700">
          {title}
        </p>

        <p className="mt-0.5 max-w-xl text-[9px] leading-4 text-slate-400">
          {description}
        </p>
      </div>

      <div className="shrink-0">{action}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Field                                                                       */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center">
      <div>
        <p className="text-[10px] font-semibold text-slate-700">
          {label}
        </p>

        <p className="mt-0.5 text-[8px] leading-4 text-slate-400">
          {description}
        </p>
      </div>

      <div>{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toggle                                                                      */
/* -------------------------------------------------------------------------- */

function Toggle({
  enabled,
  disabled,
}: {
  enabled: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 ${
        enabled ? "bg-blue-600" : "bg-slate-200"
      }`}
    >
      <span
        className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          enabled ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
