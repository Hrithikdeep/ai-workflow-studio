"use client";

import {
  Camera,
  CheckCircle2,
  Globe2,
  KeyRound,
  LogOut,
  Mail,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useLogout, useSession, useUpdateProfile } from "@/hooks/use-auth";
import { useWorkspaceSettings } from "@/hooks/use-workspace-settings";
import { ApiError } from "@/lib/api/client";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

function splitName(name: string): { first: string; last: string } {
  const trimmed = name.trim();
  if (!trimmed) return { first: "", last: "" };
  const idx = trimmed.indexOf(" ");
  return idx === -1
    ? { first: trimmed, last: "" }
    : { first: trimmed.slice(0, idx), last: trimmed.slice(idx + 1) };
}

function initialsOf(value: string): string {
  const parts = value.trim().split(/[\s@.]+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (letters || value.slice(0, 2)).toUpperCase();
}

export function ProfileSettings() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: workspace } = useWorkspaceSettings();
  const updateProfile = useUpdateProfile();
  const logout = useLogout();

  const user = session?.user ?? null;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    const { first, last } = splitName(user.name ?? "");
    setFirstName(first);
    setLastName(last);
    setEmail(user.email);
  }, [user]);

  const displayName = user?.name || user?.email || "Account";
  const initials = useMemo(() => initialsOf(displayName), [displayName]);
  const roleLabel = workspace ? ROLE_LABEL[workspace.role] ?? workspace.role : "—";

  function handleSave() {
    setSaved(false);
    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    updateProfile.mutate(
      { name, email: email.trim() },
      {
        onSuccess: () => {
          setSaved(true);
          window.setTimeout(() => setSaved(false), 1800);
        },
      },
    );
  }

  const errorMessage = updateProfile.isError
    ? updateProfile.error instanceof ApiError
      ? updateProfile.error.message
      : "Could not save your profile."
    : null;

  return (
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-7 py-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Profile
        </h1>

        <p className="mt-1 text-xs text-slate-500">
          Manage your personal information, preferences, and account settings.
        </p>
      </div>

      <main className="mx-auto max-w-5xl space-y-4 px-7 py-5">
        {/* Profile overview */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-xs font-semibold text-slate-800">
              Profile information
            </h2>

            <p className="mt-1 text-[9px] text-slate-400">
              Update the information shown across your workspace.
            </p>
          </div>

          <div className="p-5">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600">
                  <span className="text-xl font-semibold">
                    {initials}
                  </span>
                </div>

                <button
                  type="button"
                  aria-label="Change profile photo"
                  disabled
                  className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Fields */}
              <div className="grid min-w-0 flex-1 gap-4 md:grid-cols-2">
                <Field
                  label="First name"
                  icon={<UserRound />}
                >
                  <input
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    disabled={!user}
                    className="h-9 w-full rounded-md border border-slate-200 px-3 text-[10px] text-slate-700 outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </Field>

                <Field label="Last name">
                  <input
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    disabled={!user}
                    className="h-9 w-full rounded-md border border-slate-200 px-3 text-[10px] text-slate-700 outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </Field>

                <Field
                  label="Email"
                  icon={<Mail />}
                >
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={!user}
                    className="h-9 w-full rounded-md border border-slate-200 px-3 text-[10px] text-slate-700 outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </Field>

                <Field label="Role">
                  <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-[10px] text-slate-500">
                    {roleLabel}
                  </div>
                </Field>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              {errorMessage && (
                <p className="text-[10px] font-medium text-red-500">
                  {errorMessage}
                </p>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={updateProfile.isPending || !user}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saved ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}

                {updateProfile.isPending
                  ? "Saving…"
                  : saved
                    ? "Saved"
                    : "Save changes"}
              </button>
            </div>
          </div>
        </section>

        {/* Preferences */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-xs font-semibold text-slate-800">
              Preferences
            </h2>

            <p className="mt-1 text-[9px] text-slate-400">
              Configure defaults for your personal workspace experience. Not available yet.
            </p>
          </div>

          <div className="space-y-4 p-5">
            <SelectField
              icon={<Globe2 />}
              label="Language"
              description="Language used across the application."
              value="English"
              disabled
              options={[
                "English",
                "Hindi",
              ]}
            />

            <SelectField
              label="Timezone"
              description="Used for dates, schedules, and execution timestamps."
              value="Asia/Kolkata"
              disabled
              options={[
                "Asia/Kolkata",
                "UTC",
                "America/New_York",
                "Europe/London",
              ]}
            />

            <SelectField
              label="Date format"
              description="How dates are displayed in the workspace."
              value="DD MMM YYYY"
              disabled
              options={[
                "DD MMM YYYY",
                "MMM DD, YYYY",
                "YYYY-MM-DD",
              ]}
            />
          </div>
        </section>

        {/* Security */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-xs font-semibold text-slate-800">
              Account security
            </h2>

            <p className="mt-1 text-[9px] text-slate-400">
              Manage authentication and account protection.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            <SecurityRow
              icon={<KeyRound />}
              title="Password"
              description="Password changes are not available here yet."
              action="Change password"
            />

            <SecurityRow
              icon={<ShieldCheck />}
              title="Two-factor authentication"
              description="Add an additional layer of protection to your account. Not available yet."
              action="Manage 2FA"
            />
          </div>
        </section>

        {/* Session */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-xs font-semibold text-slate-800">
              Current session
            </h2>

            <p className="mt-1 text-[9px] text-slate-400">
              You are currently signed in from this device.
            </p>
          </div>

          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold text-slate-700">
                {user?.email ?? "This device"}
              </p>

              <p className="mt-0.5 text-[8px] text-slate-400">
                Current session · Active now
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                logout.mutate(undefined, {
                  onSettled: () => router.replace("/login"),
                })
              }
              disabled={logout.isPending}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[9px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              {logout.isPending ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </section>

        {/* Danger zone */}
        <section className="rounded-xl border border-red-200 bg-red-50/40">
          <div className="border-b border-red-100 px-5 py-4">
            <h2 className="text-xs font-semibold text-red-700">
              Danger zone
            </h2>

            <p className="mt-1 text-[9px] text-red-500/80">
              These actions affect your personal account.
            </p>
          </div>

          <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold text-slate-700">
                Delete account
              </p>

              <p className="mt-0.5 text-[9px] text-slate-400">
                Permanently remove your account and personal data. Not available yet.
              </p>
            </div>

            <button
              type="button"
              disabled
              className="inline-flex h-8 items-center rounded-md border border-red-200 bg-white px-2.5 text-[9px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Delete account
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Field                                                                       */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon && (
          <span className="text-slate-300 [&>svg]:h-3 [&>svg]:w-3">
            {icon}
          </span>
        )}

        <label className="text-[10px] font-medium text-slate-600">
          {label}
        </label>
      </div>

      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Select field                                                                */
/* -------------------------------------------------------------------------- */

function SelectField({
  icon,
  label,
  description,
  value,
  options,
  disabled,
}: {
  icon?: React.ReactNode;
  label: string;
  description: string;
  value: string;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[240px_minmax(0,1fr)] sm:items-center">
      <div className="flex items-start gap-2.5">
        {icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400 [&>svg]:h-3.5 [&>svg]:w-3.5">
            {icon}
          </span>
        )}

        <div>
          <p className="text-[10px] font-semibold text-slate-700">
            {label}
          </p>

          <p className="mt-0.5 text-[8px] leading-4 text-slate-400">
            {description}
          </p>
        </div>
      </div>

      <select
        value={value}
        disabled={disabled}
        onChange={() => undefined}
        className="h-9 rounded-md border border-slate-200 bg-white px-3 text-[10px] text-slate-700 outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Security row                                                                */
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
  action: string;
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

        <p className="mt-0.5 text-[9px] text-slate-400">
          {description}
        </p>
      </div>

      <button
        type="button"
        disabled
        className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[9px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {action}
      </button>
    </div>
  );
}
