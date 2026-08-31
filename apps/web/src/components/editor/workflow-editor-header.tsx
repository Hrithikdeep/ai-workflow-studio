'use client';

import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  Expand,
  Grid2X2,
  MoreHorizontal,
  Play,
  Redo2,
  Save,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

type WorkflowEditorHeaderProps = {
  workflowName: string;
  version: number;
  status: string;
  saveStatus: 'saved' | 'saving' | 'unsaved';

  canUndo?: boolean;
  canRedo?: boolean;
  canDelete?: boolean;
  isRunning?: boolean;

  onBack?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onFitView?: () => void;

  onSave?: () => void;
  onRun?: () => void;
  onValidate?: () => void;
  onPublish?: () => void;
  onGridToggle?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
};

export default function WorkflowEditorHeader({
  workflowName,
  version,
  status,
  saveStatus,

  canUndo = false,
  canRedo = false,
  canDelete = false,
  isRunning = false,

  onBack,
  onUndo,
  onRedo,
  onDuplicate,
  onDelete,
  onFitView,
  onGridToggle,
  onZoomIn,
  onZoomOut,

  onSave,
  onRun,
  onValidate,
  onPublish,
}: WorkflowEditorHeaderProps) {
  return (
    <div className="flex h-full items-center justify-between bg-white px-3">
      {/* LEFT */}

      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          title="Back"
        >
          <ArrowLeft size={15} />
        </button>

        <div className="h-5 w-px bg-slate-200" />

        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[12px] font-semibold text-slate-800">
            {workflowName}
          </span>

          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-medium text-slate-500">
            {status}
          </span>

          <span className="text-[10px] text-slate-400">
            v{version}
          </span>

          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                saveStatus === 'saved'
                  ? 'bg-emerald-500'
                  : saveStatus === 'saving'
                    ? 'bg-amber-400'
                    : 'bg-orange-500'
              }`}
            />

            {saveStatus === 'saved'
              ? 'Saved'
              : saveStatus === 'saving'
                ? 'Saving...'
                : 'Unsaved changes'}
          </span>
        </div>
      </div>

      {/* CENTER ACTIONS */}

      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-0.5">
        <HeaderButton
          title="Undo"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 size={14} />
        </HeaderButton>

        <HeaderButton
          title="Redo"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 size={14} />
        </HeaderButton>

        <div className="mx-1 h-5 w-px bg-slate-200" />

        <HeaderButton
          title="Grid"
          onClick={onGridToggle}
        >
          <Grid2X2 size={14} />
        </HeaderButton>

        <HeaderButton
          title="Fit view"
          onClick={onFitView}
        >
          <Expand size={14} />
        </HeaderButton>

        <HeaderButton
          title="Duplicate"
          onClick={onDuplicate}
        >
          <Copy size={14} />
        </HeaderButton>

        <HeaderButton
          title="Zoom out"
          onClick={onZoomOut}
        >
          <ZoomOut size={14} />
        </HeaderButton>

        <HeaderButton
          title="Zoom in"
          onClick={onZoomIn}
        >
          <ZoomIn size={14} />
        </HeaderButton>

        <HeaderButton
          title="Copy"
          onClick={onDuplicate}
        >
          <Clipboard size={14} />
        </HeaderButton>

        <HeaderButton
          title="Delete selected node"
          disabled={!canDelete}
          onClick={onDelete}
          danger
        >
          <Trash2 size={14} />
        </HeaderButton>
      </div>

      {/* RIGHT */}

      <div className="flex items-center gap-1.5">
        <HeaderAction
          label="Validate"
          icon={<Check size={13} />}
          onClick={onValidate}
        />

        <HeaderAction
          label="Save"
          icon={<Save size={13} />}
          onClick={onSave}
          disabled={saveStatus === 'saving'}
        />

        <HeaderAction
          label={isRunning ? 'Running…' : 'Run'}
          icon={<Play size={13} />}
          onClick={onRun}
          disabled={isRunning}
        />

        <button
          type="button"
          onClick={onPublish}
          className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[11px] font-medium text-white shadow-sm hover:bg-blue-700"
        >
          <Upload size={13} />
          Publish
        </button>

        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          title="More"
        >
          <MoreHorizontal size={15} />
        </button>
      </div>
    </div>
  );
}

function HeaderButton({
  children,
  title,
  disabled,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
        disabled
          ? 'cursor-not-allowed text-slate-200'
          : danger
            ? 'text-slate-500 hover:bg-red-50 hover:text-red-600'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

function HeaderAction({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}