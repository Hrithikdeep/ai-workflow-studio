"use client";

import {
  Clock3,
  KeyRound,
  LockKeyhole,
  Monitor,
  MoreHorizontal,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";

import {
  useRevokeAllSessions,
  useRevokeOtherSessions,
  useRevokeSession,
  useSessions,
} from "@/hooks/use-sessions";
import { ApiError } from "@/lib/api/client";

function formatWhen(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "unknown"
    : d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function SecuritySettings() {
  const router = useRouter();
  const sessionsQuery = useSessions();
  const revokeOthers = useRevokeOtherSessions();
  const revokeAll = useRevokeAllSessions();
  const revokeOne = useRevokeSession();

  const sessions = sessionsQuery.data ?? [];
  const otherCount = sessions.filter((s) => !s.current).length;

  const actionError = sessionsQuery.isError
    ? "Could not load active sessions."
    : (errorText(revokeOthers.error) ??
      errorText(revokeOne.error) ??
      errorText(revokeAll.error));

  return (
    <div className="space-y-4">
      {/* Security overview */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
            </div>

            <div>
              <h2 className="text-xs font-semibold text-slate-800">
                Security overview
              </h2>

              <p className="mt-1 text-[9px] leading-4 text-slate-400">
                Review workspace security controls and account protection.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <SecurityStatus
            label="Authentication"
            value="Active"
            positive
          />

          <SecurityStatus
            label="Sessions"
            value={
              sessionsQuery.isLoading
                ? "Loading…"
                : `${sessions.length} active`
            }
            positive
          />

          <SecurityStatus
            label="Security score"
            value="Not available"
          />
        </div>
      </section>

      {/* Authentication */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <SectionHeader
          title="Authentication"
          description="Configure how members authenticate with this workspace."
        />

        <div className="divide-y divide-slate-100">
          <SecurityRow
            icon={<LockKeyhole />}
            title="Multi-factor authentication"
            description="Require additional verification when signing in. Not available yet."
            action={<Toggle enabled={false} disabled />}
          />

          <SecurityRow
            icon={<KeyRound />}
            title="Password policy"
            description="Minimum password length and complexity requirements. Not available yet."
            action={
              <button
                type="button"
                disabled
                className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[9px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Configure
              </button>
            }
          />

          <SecurityRow
            icon={<Smartphone />}
            title="Single sign-on"
            description="Allow members to authenticate using your identity provider."
            action={
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[8px] font-semibold text-slate-400">
                Not configured
              </span>
            }
          />
        </div>
      </section>

      {/* Sessions */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <SectionHeader
          title="Active sessions"
          description="Devices and browsers currently signed in to the workspace."
        />

        <div className="divide-y divide-slate-100">
          {sessionsQuery.isLoading ? (
            <div className="px-5 py-4 text-[9px] text-slate-400">
              Loading sessions…
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-5 py-4 text-[9px] text-slate-400">
              No active sessions.
            </div>
          ) : (
            sessions.map((s) => (
              <SessionRow
                key={s.id}
                icon={<Monitor />}
                device={s.current ? "This device" : "Signed-in session"}
                detail={`Signed in ${formatWhen(s.createdAt)}`}
                lastActive={s.current ? "Active now" : ""}
                current={s.current}
                busy={revokeOne.isPending}
                onRevoke={
                  s.current ? undefined : () => revokeOne.mutate(s.id)
                }
              />
            ))
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-3">
          {actionError && (
            <span className="text-[9px] font-medium text-red-500">
              {actionError}
            </span>
          )}
          <button
            type="button"
            onClick={() => revokeOthers.mutate()}
            disabled={revokeOthers.isPending || otherCount === 0}
            className="text-[9px] font-semibold text-red-500 hover:text-red-600 disabled:opacity-50"
          >
            {revokeOthers.isPending
              ? "Signing out…"
              : "Sign out all other sessions"}
          </button>
        </div>
      </section>

      {/* Security events */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <SectionHeader
          title="Recent security activity"
          description="Recent changes and authentication events."
        />

        <div className="divide-y divide-slate-100">
          <div className="flex items-center gap-3 px-5 py-3.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-slate-400 [&>svg]:h-3.5 [&>svg]:w-3.5">
              <ShieldAlert />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-700">
                Activity history is not recorded yet
              </p>

              <p className="mt-0.5 text-[8px] text-slate-400">
                Sign-in and security events will appear here once available.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-red-200 bg-red-50/40">
        <div className="border-b border-red-100 px-5 py-4">
          <h2 className="text-xs font-semibold text-red-700">
            Danger zone
          </h2>

          <p className="mt-1 text-[9px] leading-4 text-red-500/80">
            Destructive security actions require confirmation.
          </p>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold text-slate-700">
              Revoke all sessions
            </p>

            <p className="mt-0.5 text-[9px] text-slate-400">
              Sign out every session, including this one. You will need to sign
              in again.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              revokeAll.mutate(undefined, {
                onSettled: () => router.replace("/login"),
              })
            }
            disabled={revokeAll.isPending}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-[9px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {revokeAll.isPending ? "Revoking…" : "Revoke sessions"}
          </button>
        </div>
      </section>
    </div>
  );
}

/** Narrow an unknown mutation error to a user-facing string (or undefined). */
function errorText(error: unknown): string | undefined {
  if (!error) return undefined;
  return error instanceof ApiError
    ? error.message
    : "Something went wrong. Please try again.";
}

/* -------------------------------------------------------------------------- */
/* Section Header                                                              */
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
/* Security Status                                                             */
/* -------------------------------------------------------------------------- */

function SecurityStatus({
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
/* Security Row                                                                */
/* -------------------------------------------------------------------------- */

function SecurityRow({
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

      <div className="shrink-0">
        {action}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Session Row                                                                 */
/* -------------------------------------------------------------------------- */

function SessionRow({
  icon,
  device,
  detail,
  lastActive,
  current,
  busy,
  onRevoke,
}: {
  icon: React.ReactNode;
  device: string;
  detail: string;
  lastActive: string;
  current?: boolean;
  busy?: boolean;
  onRevoke?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400 [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-semibold text-slate-700">
            {device}
          </p>

          {current && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[7px] font-semibold text-emerald-600">
              Current
            </span>
          )}
        </div>

        <p className="mt-0.5 text-[8px] text-slate-400">
          {detail}
        </p>
      </div>

      {lastActive && (
        <div className="hidden text-right sm:block">
          <p className="text-[9px] font-medium text-slate-500">
            {lastActive}
          </p>

          <p className="mt-0.5 flex items-center justify-end gap-1 text-[8px] text-slate-400">
            <Clock3 className="h-2.5 w-2.5" />
            Session active
          </p>
        </div>
      )}

      <button
        type="button"
        aria-label={`Sign out ${device}`}
        onClick={onRevoke}
        disabled={!onRevoke || busy}
        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 hover:bg-slate-50 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
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
      className={`flex h-5 w-9 items-center rounded-full p-0.5 disabled:opacity-50 ${
        enabled ? "bg-blue-600" : "bg-slate-200"
      }`}
    >
      <span
        className={`h-4 w-4 rounded-full bg-white shadow-sm ${
          enabled ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
