"use client";

import {
  Building2,
  Check,
  Globe2,
  Save,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  useUpdateWorkspaceSettings,
  useWorkspaceSettings,
} from "@/hooks/use-workspace-settings";
import { ApiError } from "@/lib/api/client";

export function GeneralSettings() {
  const { data, isLoading, isError } = useWorkspaceSettings();
  const update = useUpdateWorkspaceSettings();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultEnvironment, setDefaultEnvironment] = useState("Production");
  const [defaultTimezone, setDefaultTimezone] = useState("UTC");
  const [defaultVisibility, setDefaultVisibility] = useState("Workspace");
  const [saved, setSaved] = useState(false);

  const canEdit = data?.role === "owner" || data?.role === "admin";

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setDescription(data.description);
    setDefaultEnvironment(data.defaultEnvironment);
    setDefaultTimezone(data.defaultTimezone);
    setDefaultVisibility(data.defaultVisibility);
  }, [data]);

  function handleSave() {
    setSaved(false);
    update.mutate(
      {
        name,
        description,
        defaultEnvironment,
        defaultTimezone,
        defaultVisibility,
      },
      {
        onSuccess: () => {
          setSaved(true);
          window.setTimeout(() => setSaved(false), 2500);
        },
      },
    );
  }

  const errorMessage = isError
    ? "Could not load workspace settings."
    : update.isError
      ? update.error instanceof ApiError
        ? update.error.message
        : "Could not save changes."
      : null;

  return (
    <div className="space-y-4">
      {/* Workspace */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-xs font-semibold text-slate-800">
            Workspace
          </h2>

          <p className="mt-1 text-[9px] text-slate-400">
            Basic information about your Relay workspace.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <SettingField
            icon={<Building2 />}
            label="Workspace name"
            description="The name shown across your workspace."
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isLoading || !canEdit}
              className="h-9 w-full rounded-md border border-slate-200 px-3 text-xs text-slate-700 outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </SettingField>

          <SettingField
            icon={<Globe2 />}
            label="Workspace slug"
            description="Used in workspace URLs and identifiers."
          >
            <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-500">
              {data?.slug ?? (isLoading ? "Loading…" : "")}
            </div>
          </SettingField>

          <SettingField
            label="Description"
            description="A short description of this workspace."
          >
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={isLoading || !canEdit}
              rows={3}
              className="w-full resize-none rounded-md border border-slate-200 px-3 py-2.5 text-xs leading-5 text-slate-700 outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </SettingField>
        </div>
      </section>

      {/* Defaults */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-xs font-semibold text-slate-800">
            Defaults
          </h2>

          <p className="mt-1 text-[9px] text-slate-400">
            Configure defaults used across new workflows.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <SelectField
            label="Default environment"
            value={defaultEnvironment}
            disabled={isLoading || !canEdit}
            onChange={setDefaultEnvironment}
            options={[
              "Production",
              "Staging",
              "Development",
            ]}
          />

          <SelectField
            label="Default timezone"
            value={defaultTimezone}
            disabled={isLoading || !canEdit}
            onChange={setDefaultTimezone}
            options={[
              "Asia/Kolkata",
              "UTC",
              "America/New_York",
              "Europe/London",
            ]}
          />

          <SelectField
            label="Default workflow visibility"
            value={defaultVisibility}
            disabled={isLoading || !canEdit}
            onChange={setDefaultVisibility}
            options={[
              "Workspace",
              "Private",
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
          disabled={update.isPending || isLoading || !canEdit}
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

function SettingField({
  icon,
  label,
  description,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-start">
      <div className="flex gap-2.5">
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

      <div>{children}</div>
    </div>
  );
}

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
