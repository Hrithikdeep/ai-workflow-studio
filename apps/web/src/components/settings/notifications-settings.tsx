"use client";

import {
  Bell,
  Check,
  CheckCircle2,
  Mail,
  MessageSquare,
  Play,
  Save,
  Settings2,
  TriangleAlert,
} from "lucide-react";

import { useEffect, useState } from "react";

import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "@/hooks/use-notification-preferences";
import { ApiError } from "@/lib/api/client";

type NotificationKey =
  | "workflowFailed"
  | "workflowCompleted"
  | "workflowRunning"
  | "security"
  | "system";

type NotificationSetting = {
  key: NotificationKey;
  title: string;
  description: string;
  icon: React.ReactNode;
  email: boolean;
  inApp: boolean;
};

const INITIAL_SETTINGS: NotificationSetting[] = [
  {
    key: "workflowFailed",
    title: "Workflow failures",
    description:
      "Get notified when a workflow execution fails or is stopped.",
    icon: <TriangleAlert />,
    email: true,
    inApp: true,
  },
  {
    key: "workflowCompleted",
    title: "Workflow completed",
    description:
      "Get notified when important workflow runs complete successfully.",
    icon: <CheckCircle2 />,
    email: false,
    inApp: true,
  },
  {
    key: "workflowRunning",
    title: "Long-running workflows",
    description:
      "Get notified when an execution exceeds its expected duration.",
    icon: <Play />,
    email: false,
    inApp: true,
  },
  {
    key: "security",
    title: "Security activity",
    description:
      "Receive alerts about sign-ins, password changes, and security events.",
    icon: <Settings2 />,
    email: true,
    inApp: true,
  },
  {
    key: "system",
    title: "System announcements",
    description:
      "Important product, maintenance, and platform announcements.",
    icon: <Bell />,
    email: true,
    inApp: false,
  },
];

const DIGEST_FREQUENCY_DEFAULT = "Daily";
const DIGEST_TIME_DEFAULT = "9:00 AM";

type StoredPrefs = {
  rows?: Partial<Record<NotificationKey, { email?: boolean; inApp?: boolean }>>;
  digestFrequency?: string;
  digestTime?: string;
};

export function NotificationsSettings() {
  const { data, isLoading, isError } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  const [settings, setSettings] =
    useState<NotificationSetting[]>(INITIAL_SETTINGS);
  const [digestFrequency, setDigestFrequency] = useState(
    DIGEST_FREQUENCY_DEFAULT,
  );
  const [digestTime, setDigestTime] = useState(DIGEST_TIME_DEFAULT);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = data?.preferences as StoredPrefs | null | undefined;
    if (!stored) return;
    setSettings(
      INITIAL_SETTINGS.map((s) => ({
        ...s,
        email: stored.rows?.[s.key]?.email ?? s.email,
        inApp: stored.rows?.[s.key]?.inApp ?? s.inApp,
      })),
    );
    if (stored.digestFrequency) setDigestFrequency(stored.digestFrequency);
    if (stored.digestTime) setDigestTime(stored.digestTime);
  }, [data]);

  function toggleSetting(
    key: NotificationKey,
    channel: "email" | "inApp",
  ) {
    setSettings((current) =>
      current.map((setting) =>
        setting.key === key
          ? {
              ...setting,
              [channel]: !setting[channel],
            }
          : setting,
      ),
    );
  }

  function handleSave() {
    setSaved(false);
    const rows = Object.fromEntries(
      settings.map((s) => [s.key, { email: s.email, inApp: s.inApp }]),
    );
    update.mutate(
      { rows, digestFrequency, digestTime },
      {
        onSuccess: () => {
          setSaved(true);
          window.setTimeout(() => setSaved(false), 2500);
        },
      },
    );
  }

  const errorMessage = isError
    ? "Could not load notification preferences."
    : update.isError
      ? update.error instanceof ApiError
        ? update.error.message
        : "Could not save changes."
      : null;

  return (
    <div className="space-y-4">
      {/* Overview */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600">
              <Bell className="h-4 w-4" />
            </div>

            <div>
              <h2 className="text-xs font-semibold text-slate-800">
                Notifications
              </h2>

              <p className="mt-1 text-[9px] leading-4 text-slate-400">
                Choose which events should notify you and where those notifications should appear. Preferences are saved to your account; delivery is not yet enabled.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <ChannelCard
            icon={<Mail />}
            title="Email notifications"
            description="Receive selected alerts by email."
          />

          <ChannelCard
            icon={<MessageSquare />}
            title="In-app notifications"
            description="Show alerts inside the Relay workspace."
          />
        </div>
      </section>

      {/* Preferences */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-xs font-semibold text-slate-800">
            Notification preferences
          </h2>

          <p className="mt-1 text-[9px] text-slate-400">
            Configure notifications by event type.
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {settings.map((setting) => (
            <NotificationRow
              key={setting.key}
              setting={setting}
              disabled={isLoading}
              onToggle={(channel) =>
                toggleSetting(setting.key, channel)
              }
            />
          ))}
        </div>
      </section>

      {/* Digest */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-xs font-semibold text-slate-800">
            Notification digest
          </h2>

          <p className="mt-1 text-[9px] text-slate-400">
            Control how frequently non-critical notifications are grouped.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <SelectField
            label="Digest frequency"
            value={digestFrequency}
            disabled={isLoading}
            onChange={setDigestFrequency}
            options={[
              "Immediately",
              "Hourly",
              "Daily",
              "Weekly",
              "Never",
            ]}
          />

          <SelectField
            label="Digest time"
            value={digestTime}
            disabled={isLoading}
            onChange={setDigestTime}
            options={[
              "8:00 AM",
              "9:00 AM",
              "12:00 PM",
              "6:00 PM",
            ]}
          />
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center justify-end gap-3">
        {errorMessage && (
          <p className="text-[10px] font-medium text-red-500">{errorMessage}</p>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={update.isPending || isLoading}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saved ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {update.isPending ? "Saving…" : saved ? "Saved" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Channel Card                                                                */
/* -------------------------------------------------------------------------- */

function ChannelCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
      </div>

      <div>
        <p className="text-[10px] font-semibold text-slate-700">
          {title}
        </p>

        <p className="mt-0.5 text-[8px] leading-4 text-slate-400">
          {description}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Notification Row                                                            */
/* -------------------------------------------------------------------------- */

function NotificationRow({
  setting,
  onToggle,
  disabled,
}: {
  setting: NotificationSetting;
  onToggle: (channel: "email" | "inApp") => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400 [&>svg]:h-3.5 [&>svg]:w-3.5">
          {setting.icon}
        </div>

        <div>
          <p className="text-[10px] font-semibold text-slate-700">
            {setting.title}
          </p>

          <p className="mt-0.5 max-w-xl text-[9px] leading-4 text-slate-400">
            {setting.description}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-5 pl-11 md:pl-0">
        <ChannelToggle
          label="Email"
          enabled={setting.email}
          disabled={disabled}
          onClick={() => onToggle("email")}
        />

        <ChannelToggle
          label="In-app"
          enabled={setting.inApp}
          disabled={disabled}
          onClick={() => onToggle("inApp")}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Channel Toggle                                                              */
/* -------------------------------------------------------------------------- */

function ChannelToggle({
  label,
  enabled,
  onClick,
  disabled,
}: {
  label: string;
  enabled: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[9px] font-medium text-slate-500">
        {label}
      </span>

      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={`${enabled ? "Disable" : "Enable"} ${label}`}
        className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 ${
          enabled ? "bg-blue-600" : "bg-slate-200"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            enabled
              ? "translate-x-4"
              : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Select Field                                                                */
/* -------------------------------------------------------------------------- */

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: string[];
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center">
      <label className="text-[10px] font-semibold text-slate-700">
        {label}
      </label>

      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        className="h-9 rounded-md border border-slate-200 bg-white px-3 text-[10px] text-slate-700 outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}
