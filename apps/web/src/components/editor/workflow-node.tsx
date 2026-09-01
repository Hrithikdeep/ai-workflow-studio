'use client';

import { memo } from 'react';

import {
  Bot,
  Braces,
  Database,
  Globe,
  Mail,
  MessageSquare,
  Play,
  Sparkles,
  Webhook,
  GitBranch,
  FileJson,
  type LucideIcon,
} from 'lucide-react';

import {
  Handle,
  Position,
  type NodeProps,
} from 'reactflow';

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

export type WorkflowNodeType =
  | 'manual'
  | 'webhook'
  | 'http'
  | 'condition'
  | 'json-transform'
  | 'ai-prompt'
  | 'ai-agent'
  | 'structured-extraction'
  | 'gmail'
  | 'slack'
  | 'postgresql'
  | 'output';

export type WorkflowNodeData = {
  executed: boolean;
  executionDuration: any;
  type?: WorkflowNodeType | string;
  label?: string;
  description?: string;
  config?: Record<string, unknown>;
  status?: 'success' | 'error' | 'running' | 'pending' | 'idle';
};

/* -------------------------------------------------------------------------- */
/* NODE METADATA                                                              */
/* -------------------------------------------------------------------------- */

type NodeMeta = {
  icon: LucideIcon;
  iconClass: string;
  iconBackground: string;
  defaultLabel: string;
  defaultDescription: string;
};

const NODE_META: Record<string, NodeMeta> = {
  manual: {
    icon: Play,
    iconClass: 'text-amber-600',
    iconBackground: 'bg-amber-50',
    defaultLabel: 'Manual Input',
    defaultDescription: 'Run on demand',
  },

  webhook: {
    icon: Webhook,
    iconClass: 'text-orange-600',
    iconBackground: 'bg-orange-50',
    defaultLabel: 'Webhook',
    defaultDescription: 'Trigger from an HTTP endpoint',
  },

  http: {
    icon: Globe,
    iconClass: 'text-sky-600',
    iconBackground: 'bg-sky-50',
    defaultLabel: 'HTTP Request',
    defaultDescription: 'Call any REST API',
  },

  condition: {
    icon: GitBranch,
    iconClass: 'text-blue-600',
    iconBackground: 'bg-blue-50',
    defaultLabel: 'Condition',
    defaultDescription: 'Branch on a comparison',
  },

  'json-transform': {
    icon: Braces,
    iconClass: 'text-violet-600',
    iconBackground: 'bg-violet-50',
    defaultLabel: 'JSON Transform',
    defaultDescription: 'Reshape payloads',
  },

  'ai-prompt': {
    icon: Sparkles,
    iconClass: 'text-purple-600',
    iconBackground: 'bg-purple-50',
    defaultLabel: 'AI Prompt',
    defaultDescription: 'Single-shot model call',
  },

  'ai-agent': {
    icon: Bot,
    iconClass: 'text-indigo-600',
    iconBackground: 'bg-indigo-50',
    defaultLabel: 'AI Agent',
    defaultDescription: 'Tool-using reasoning loop',
  },

  'structured-extraction': {
    icon: FileJson,
    iconClass: 'text-fuchsia-600',
    iconBackground: 'bg-fuchsia-50',
    defaultLabel: 'Structured Extraction',
    defaultDescription: 'Typed JSON from text',
  },

  gmail: {
    icon: Mail,
    iconClass: 'text-red-500',
    iconBackground: 'bg-red-50',
    defaultLabel: 'Gmail',
    defaultDescription: 'Send email',
  },

  slack: {
    icon: MessageSquare,
    iconClass: 'text-emerald-600',
    iconBackground: 'bg-emerald-50',
    defaultLabel: 'Slack',
    defaultDescription: 'Post to a channel',
  },

  postgresql: {
    icon: Database,
    iconClass: 'text-blue-700',
    iconBackground: 'bg-blue-50',
    defaultLabel: 'PostgreSQL',
    defaultDescription: 'Read or write rows',
  },

  output: {
    icon: Braces,
    iconClass: 'text-slate-600',
    iconBackground: 'bg-slate-100',
    defaultLabel: 'Output',
    defaultDescription: 'Return the workflow result',
  },
};

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function normalizeNodeType(type?: string) {
  if (!type) {
    return 'output';
  }

  const normalized = type.toLowerCase().trim();

  const aliases: Record<string, string> = {
    'manual-input': 'manual',
    manualinput: 'manual',

    webhook: 'webhook',

    'http-request': 'http',
    httprequest: 'http',

    condition: 'condition',

    'json-transform': 'json-transform',
    jsontransform: 'json-transform',

    'ai-prompt': 'ai-prompt',
    aiprompt: 'ai-prompt',

    'ai-agent': 'ai-agent',
    aiagent: 'ai-agent',
    agent: 'ai-agent',

    'structured-extraction': 'structured-extraction',
    structuredextraction: 'structured-extraction',

    gmail: 'gmail',

    slack: 'slack',

    postgresql: 'postgresql',
    postgres: 'postgresql',

    output: 'output',
  };

  return aliases[normalized] ?? normalized;
}

function getConfigDescription(
  config?: Record<string, unknown>,
) {
  if (!config) {
    return undefined;
  }

  const candidates = [
    config.description,
    config.subtitle,
    config.endpoint,
    config.method,
    config.url,
    config.channel,
    config.schema,
    config.model,
  ];

  const value = candidates.find(
    (item) =>
      typeof item === 'string' &&
      item.trim().length > 0,
  );

  return typeof value === 'string'
    ? value
    : undefined;
}

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

function WorkflowNode({
  data,
  selected,
}: NodeProps<WorkflowNodeData>) {
  const normalizedType = normalizeNodeType(data?.type);

  const meta =
    NODE_META[normalizedType] ??
    NODE_META.output;

  const Icon = meta.icon;

  const label =
    data?.label?.trim() ||
    meta.defaultLabel;

  const description =
    getConfigDescription(data?.config) ||
    data?.description ||
    meta.defaultDescription;

  const isCondition =
    normalizedType === 'condition';

  const status = data?.status ?? 'idle';

  const executionDuration =
    typeof data?.executionDuration === 'number'
      ? `${data.executionDuration}ms`
      : null;

  const statusClass =
    status === 'error'
      ? 'bg-red-500'
      : status === 'success'
        ? 'bg-emerald-500'
        : status === 'running'
          ? 'bg-blue-500'
          : status === 'pending'
            ? 'bg-amber-400'
            : '';

  const isExecuted =
    status === 'success' || data?.executed === true;

  return (
    <div
      className={[
        'relative',
        'w-[190px]',
        'rounded-lg',
        'border',
        'bg-white',
        'shadow-sm',
        'transition-all',
        'duration-150',

        isExecuted
          ? 'border-emerald-300 ring-2 ring-emerald-100 shadow-md'
          : selected
            ? 'border-blue-500 ring-2 ring-blue-100 shadow-md'
            : 'border-slate-200 hover:border-slate-300 hover:shadow-md',
      ].join(' ')}
    >
      {/* ------------------------------------------------------------------ */}
      {/* INPUT HANDLE                                                       */}
      {/* ------------------------------------------------------------------ */}

      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-2 !border-white !bg-blue-500"
      />

      {/* ------------------------------------------------------------------ */}
      {/* NODE CONTENT                                                       */}
      {/* ------------------------------------------------------------------ */}

      <div className="flex min-h-[68px] items-center gap-3 px-3 py-2.5">
        {/* ICON */}

        <div
          className={[
            'flex',
            'h-8',
            'w-8',
            'shrink-0',
            'items-center',
            'justify-center',
            'rounded-md',
            meta.iconBackground,
          ].join(' ')}
        >
          <Icon
            size={16}
            strokeWidth={1.8}
            className={meta.iconClass}
          />
        </div>

        {/* TEXT */}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-[12px] font-semibold text-slate-800">
              {label}
            </div>

            {statusClass && (
              <span
                className={[
                  'h-1.5',
                  'w-1.5',
                  'shrink-0',
                  'rounded-full',
                  statusClass,
                ].join(' ')}
              />
            )}
          </div>

          <div className="mt-1 truncate text-[10px] leading-4 text-slate-400">
            {description}
          </div>

          {executionDuration && (
            <div className="mt-1 flex items-center gap-1 text-[8px] font-medium text-emerald-600">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {executionDuration}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* CONDITION HANDLES                                                  */}
      {/* ------------------------------------------------------------------ */}

      {isCondition ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="!h-2 !w-2 !border-2 !border-white !bg-emerald-500"
            style={{
              left: '35%',
            }}
          />

          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!h-2 !w-2 !border-2 !border-white !bg-slate-400"
            style={{
              left: '65%',
            }}
          />

          <div
            className="
              pointer-events-none
              absolute
              -bottom-5
              left-[35%]
              -translate-x-1/2
              text-[8px]
              font-semibold
              uppercase
              tracking-wide
              text-emerald-600
            "
          >
            TRUE
          </div>

          <div
            className="
              pointer-events-none
              absolute
              -bottom-5
              left-[65%]
              -translate-x-1/2
              text-[8px]
              font-semibold
              uppercase
              tracking-wide
              text-slate-400
            "
          >
            FALSE
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-2 !w-2 !border-2 !border-white !bg-blue-500"
        />
      )}
    </div>
  );
}

/*
 * React Flow re-renders a node whenever its wrapper reconciles. Memoizing keeps
 * an unchanged node (stable `data` / `selected`) from re-rendering when a
 * sibling node moves or the graph array identity changes.
 */
export default memo(WorkflowNode);