'use client';

import {
  Bot,
  Braces,
  Database,
  GitBranch,
  Globe,
  Mail,
  MessageSquare,
  Play,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';

export type PaletteNode = {
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export type PaletteGroup = {
  title: string;
  nodes: PaletteNode[];
};

const PALETTE_GROUPS: PaletteGroup[] = [
  {
    title: 'Triggers',
    nodes: [
      {
        type: 'MANUAL_TRIGGER',
        label: 'Manual Input',
        description: 'Run on demand with test payload',
        icon: Play,
      },
      {
        type: 'WEBHOOK',
        label: 'Webhook',
        description: 'Trigger from an HTTP endpoint',
        icon: Webhook,
      },
    ],
  },
  {
    title: 'Logic & Data',
    nodes: [
      {
        type: 'HTTP_REQUEST',
        label: 'HTTP Request',
        description: 'Call any REST API',
        icon: Globe,
      },
      {
        type: 'CONDITION',
        label: 'Condition',
        description: 'Branch on a comparison',
        icon: GitBranch,
      },
      {
        type: 'JSON_TRANSFORM',
        label: 'JSON Transform',
        description: 'Reshape payloads',
        icon: Braces,
      },
    ],
  },
  {
    title: 'AI',
    nodes: [
      {
        type: 'AI_PROMPT',
        label: 'AI Prompt',
        description: 'Single-shot model call',
        icon: MessageSquare,
      },
      {
        type: 'AI_AGENT',
        label: 'AI Agent',
        description: 'Tool-using reasoning loop',
        icon: Bot,
      },
      {
        type: 'STRUCTURED_EXTRACTION',
        label: 'Structured Extraction',
        description: 'Typed JSON from text',
        icon: Braces,
      },
    ],
  },
  {
    title: 'Integrations',
    nodes: [
      {
        type: 'GMAIL',
        label: 'Gmail',
        description: 'Send email',
        icon: Mail,
      },
      {
        type: 'SLACK',
        label: 'Slack',
        description: 'Post to a channel',
        icon: MessageSquare,
      },
    ],
  },
  {
    title: 'Data',
    nodes: [
      {
        type: 'POSTGRESQL',
        label: 'PostgreSQL',
        description: 'Read or write rows',
        icon: Database,
      },
    ],
  },
  {
    title: 'Output',
    nodes: [
      {
        type: 'OUTPUT',
        label: 'Output',
        description: 'Return the workflow result',
        icon: Braces,
      },
    ],
  },
];

export default function NodePalette() {
  const [search, setSearch] = useState('');

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return PALETTE_GROUPS;
    }

    return PALETTE_GROUPS
      .map((group) => ({
        ...group,
        nodes: group.nodes.filter(
          (node) =>
            node.label.toLowerCase().includes(query) ||
            node.description.toLowerCase().includes(query) ||
            node.type.toLowerCase().includes(query),
        ),
      }))
      .filter((group) => group.nodes.length > 0);
  }, [search]);

  const totalNodes = PALETTE_GROUPS.reduce(
    (total, group) => total + group.nodes.length,
    0,
  );

  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    node: PaletteNode,
  ) => {
    event.dataTransfer.setData(
      'application/relay-node',
      JSON.stringify({
        type: node.type,
        label: node.label,
        description: node.description,
      }),
    );

    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* HEADER */}

      <div className="shrink-0 border-b border-slate-200">
        <div className="flex h-10 items-center justify-between px-3">
          <span className="text-[11px] font-medium text-slate-700">
            Nodes
          </span>

          <span className="text-[10px] text-slate-400">
            {totalNodes}
          </span>
        </div>

        <div className="px-2.5 pb-2.5">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search nodes..."
              className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-[11px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            />
          </div>
        </div>
      </div>

      {/* NODE LIST */}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {filteredGroups.map((group) => (
          <section
            key={group.title}
            className="mb-5 last:mb-0"
          >
            <div className="mb-1.5 px-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              {group.title}
            </div>

            <div className="space-y-0.5">
              {group.nodes.map((node) => {
                const Icon = node.icon;

                return (
                  <div
                    key={node.type}
                    draggable
                    onDragStart={(event) =>
                      handleDragStart(event, node)
                    }
                    className="group flex cursor-grab items-center gap-2 rounded-md px-1.5 py-2 transition hover:bg-slate-50 active:cursor-grabbing active:bg-slate-100"
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm">
                      <Icon size={13} strokeWidth={1.8} />
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-medium leading-4 text-slate-700 group-hover:text-slate-900">
                        {node.label}
                      </div>

                      <div className="truncate text-[9px] leading-3.5 text-slate-400">
                        {node.description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {filteredGroups.length === 0 && (
          <div className="px-2 py-8 text-center text-[10px] text-slate-400">
            No nodes found.
          </div>
        )}
      </div>

      {/* FOOTER */}

      <div className="shrink-0 border-t border-slate-100 px-3 py-2">
        <p className="text-[9px] leading-3.5 text-slate-400">
          Drag a node onto the canvas to add it.
        </p>
      </div>
    </div>
  );
}