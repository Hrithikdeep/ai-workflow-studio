"use client";

import { useState } from "react";
import { X } from "lucide-react";

type Workflow = {
  id: string;
  name: string;
};

type NewWorkflowFormProps = {
  open: boolean;
  onClose: () => void;
  /** Accepted for backwards compatibility with existing callers; unused. */
  workflows?: Workflow[];
  onCreate?: (data: {
    name: string;
    description: string;
    startFrom: "blank" | "duplicate";
    sourceWorkflowId?: string;
  }) => void;
};

export default function NewWorkflowForm({
  open,
  onClose,
  onCreate,
}: NewWorkflowFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  if (!open) return null;

  const canCreate = name.trim().length > 0;

  const handleCreate = () => {
    if (!canCreate) return;

    // New workflows always start blank (an empty version 1 graph). The
    // "duplicate existing" path was removed because it was non-functional;
    // the payload shape is kept for the existing callers.
    onCreate?.({
      name: name.trim(),
      description: description.trim(),
      startFrom: "blank",
      sourceWorkflowId: undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-[400px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-workflow-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2
            id="create-workflow-title"
            className="text-[15px] font-semibold text-slate-900"
          >
            Create Workflow
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-5 px-5 py-5">
          {/* Workflow name */}
          <div>
            <label
              htmlFor="workflow-name"
              className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-600"
            >
              Workflow Name
            </label>

            <input
              id="workflow-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Invoice Anomaly Detection"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="workflow-description"
              className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-600"
            >
              Description
            </label>

            <textarea
              id="workflow-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What does this workflow automate?"
              rows={3}
              className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />

            <p className="mt-2 text-[11px] text-slate-400">
              Optional. Helps teammates understand the workflow.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!canCreate}
            onClick={handleCreate}
            className="h-9 rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create Workflow
          </button>
        </div>
      </div>
    </div>
  );
}
