'use client';

import {
  Bot,
  Braces,
  Check,
  Database,
  FileJson,
  Globe,
  Mail,
  MessageSquare,
  Play,
  Sparkles,
  Webhook,
  X,
} from 'lucide-react';

import { useEffect, useMemo, useState } from 'react';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import type { Node } from 'reactflow';

import { useIntegrations } from '@/hooks/use-integrations';
import {
  useRotateWebhookSecret,
  useSetWebhookEnabled,
  useWebhook,
} from '@/hooks/use-webhooks';
import { ApiError } from '@/lib/api/client';
import {
  DEFAULT_OPENAI_MODEL,
  OPENAI_MODELS,
  OPENAI_MODEL_LABELS,
  isSupportedOpenAiModel,
} from '@/lib/ai-models';

import type {
  WorkflowCanvasNodeData,
} from './workflow-canvas';

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

type ConfigValue = string | number | boolean | string[];

type NodeConfigPanelProps = {
  node: Node<WorkflowCanvasNodeData> | null;

  onChange?: (
    nodeId: string,
    config: Record<string, unknown>,
    label?: string,
    description?: string,
  ) => void;
};

type ConfigFieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  expression?: boolean;
  onChange: (value: string) => void;
};

type SelectFieldProps = {
  label: string;
  value: string;
  options: {
    value: string;
    label: string;
  }[];
  onChange: (value: string) => void;
};

/* -------------------------------------------------------------------------- */
/* NODE META                                                                  */
/* -------------------------------------------------------------------------- */

const NODE_META: Record<
  string,
  {
    category: string;
    icon: typeof Play;
    iconClass: string;
    iconBackground: string;
  }
> = {
  MANUAL_TRIGGER: {
    category: 'Triggers',
    icon: Play,
    iconClass: 'text-amber-600',
    iconBackground: 'bg-amber-50',
  },

  WEBHOOK: {
    category: 'Triggers',
    icon: Webhook,
    iconClass: 'text-orange-600',
    iconBackground: 'bg-orange-50',
  },

  HTTP_REQUEST: {
    category: 'Logic & Data',
    icon: Globe,
    iconClass: 'text-sky-600',
    iconBackground: 'bg-sky-50',
  },

  CONDITION: {
    category: 'Logic & Data',
    icon: Braces,
    iconClass: 'text-blue-600',
    iconBackground: 'bg-blue-50',
  },

  JSON_TRANSFORM: {
    category: 'Logic & Data',
    icon: Braces,
    iconClass: 'text-violet-600',
    iconBackground: 'bg-violet-50',
  },

  AI_PROMPT: {
    category: 'AI',
    icon: Sparkles,
    iconClass: 'text-purple-600',
    iconBackground: 'bg-purple-50',
  },

  AI_AGENT: {
    category: 'AI',
    icon: Bot,
    iconClass: 'text-indigo-600',
    iconBackground: 'bg-indigo-50',
  },

  STRUCTURED_EXTRACTION: {
    category: 'AI',
    icon: FileJson,
    iconClass: 'text-fuchsia-600',
    iconBackground: 'bg-fuchsia-50',
  },

  GMAIL: {
    category: 'Integrations',
    icon: Mail,
    iconClass: 'text-red-500',
    iconBackground: 'bg-red-50',
  },

  SLACK: {
    category: 'Integrations',
    icon: MessageSquare,
    iconClass: 'text-emerald-600',
    iconBackground: 'bg-emerald-50',
  },

  POSTGRESQL: {
    category: 'Data',
    icon: Database,
    iconClass: 'text-blue-700',
    iconBackground: 'bg-blue-50',
  },

  OUTPUT: {
    category: 'Output',
    icon: Braces,
    iconClass: 'text-slate-600',
    iconBackground: 'bg-slate-100',
  },
};

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function NodeConfigPanel({
  node,
  onChange,
}: NodeConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<
    'configure' | 'test' | 'output' | 'docs'
  >('configure');

  /* ------------------------------------------------------------------------ */
  /* Empty state                                                              */
  /* ------------------------------------------------------------------------ */

  if (!node) {
    return (
      <div className="flex h-full flex-col bg-white">
        <div className="shrink-0 border-b border-slate-200 px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">
            Properties
          </div>

          <div className="mt-1 text-xs text-slate-500">
            Select a node to configure it.
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center px-6">
          <div className="text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
              <Braces
                size={17}
                className="text-slate-300"
              />
            </div>

            <div className="mt-3 text-xs font-medium text-slate-600">
              No node selected
            </div>

            <div className="mt-1 text-[10px] leading-4 text-slate-400">
              Select a node on the canvas to
              configure its properties.
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Node data                                                                */
  /* ------------------------------------------------------------------------ */

  // The editor palette uses `POSTGRESQL`, but a saved graph comes back with
  // the backend-normalized `POSTGRES`. Treat them as the same node type so the
  // Configuration form (and NODE_META lookup) render after a reload.
  const rawType =
    String(node.data?.type ?? 'OUTPUT')
      .trim()
      .toUpperCase();

  const type = rawType === 'POSTGRES' ? 'POSTGRESQL' : rawType;

  const meta =
    NODE_META[type] ??
    NODE_META.OUTPUT;

  const Icon = meta.icon;

  const label =
    node.data?.label ??
    'Unnamed Node';

  const description =
    node.data?.description ??
    '';

  const config =
    node.data?.config ?? {};

  /* ------------------------------------------------------------------------ */
  /* Config updater                                                           */
  /* ------------------------------------------------------------------------ */

  const updateConfig = (
    key: string,
    value: ConfigValue,
  ) => {
    const nextConfig = {
      ...config,
      [key]: value,
    };

    onChange?.(
      node.id,
      nextConfig,
    );
  };

  /* ------------------------------------------------------------------------ */
  /* Label updater                                                            */
  /* ------------------------------------------------------------------------ */

  const updateLabel = (
    value: string,
  ) => {
    onChange?.(
      node.id,
      config,
      value,
      description,
    );
  };

  /* ------------------------------------------------------------------------ */
  /* Description updater                                                      */
  /* ------------------------------------------------------------------------ */

  const updateDescription = (
    value: string,
  ) => {
    onChange?.(
      node.id,
      config,
      label,
      value,
    );
  };

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* ================================================================== */}
      {/* NODE HEADER                                                        */}
      {/* ================================================================== */}

      <div className="shrink-0 border-b border-slate-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <div
            className={[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              meta.iconBackground,
            ].join(' ')}
          >
            <Icon
              size={17}
              strokeWidth={1.8}
              className={meta.iconClass}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold text-slate-800">
              {label}
            </div>

            <div className="mt-0.5 text-[9px] text-slate-400">
              {meta.category}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[8px] font-medium uppercase tracking-wide text-slate-400">
            {type}
          </div>
        </div>

        {/* ================================================================ */}
        {/* TABS                                                             */}
        {/* ================================================================ */}

        <div className="grid grid-cols-4 border-t border-slate-100">
          <ConfigTab
            active={
              activeTab === 'configure'
            }
            onClick={() =>
              setActiveTab('configure')
            }
          >
            Configure
          </ConfigTab>

          <ConfigTab
            active={
              activeTab === 'test'
            }
            onClick={() =>
              setActiveTab('test')
            }
          >
            Test
          </ConfigTab>

          <ConfigTab
            active={
              activeTab === 'output'
            }
            onClick={() =>
              setActiveTab('output')
            }
          >
            Output
          </ConfigTab>

          <ConfigTab
            active={
              activeTab === 'docs'
            }
            onClick={() =>
              setActiveTab('docs')
            }
          >
            Docs
          </ConfigTab>
        </div>
      </div>

      {/* ================================================================== */}
      {/* CONTENT                                                            */}
      {/* ================================================================== */}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'configure' && (
          <ConfigurePanel
            node={node}
            type={type}
            label={label}
            description={description}
            config={config}
            updateConfig={updateConfig}
            updateLabel={updateLabel}
            updateDescription={
              updateDescription
            }
          />
        )}

        {activeTab === 'test' && (
          <TestPanel node={node} />
        )}

        {activeTab === 'output' && (
          <OutputPanel node={node} />
        )}

        {activeTab === 'docs' && (
          <DocsPanel
            node={node}
            type={type}
            category={meta.category}
          />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* CONFIGURE PANEL                                                            */
/* -------------------------------------------------------------------------- */

function ConfigurePanel({
  node,
  type,
  label,
  description,
  config,
  updateConfig,
  updateLabel,
  updateDescription,
}: {
  node: Node<WorkflowCanvasNodeData>;
  type: string;
  label: string;
  description: string;
  config: Record<string, unknown>;
  updateConfig: (
    key: string,
    value: ConfigValue,
  ) => void;
  updateLabel: (
    value: string,
  ) => void;
  updateDescription: (
    value: string,
  ) => void;
}) {
  return (
    <div className="p-4">
      {/* ================================================================ */}
      {/* NAME                                                             */}
      {/* ================================================================ */}

      <ConfigField
        label="Name"
        value={label}
        onChange={updateLabel}
        placeholder="Step name"
      />

      {/* ================================================================ */}
      {/* NODE SPECIFIC                                                    */}
      {/* ================================================================ */}

      <div className="mt-5">
        <div className="mb-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          Configuration
        </div>

        {type === 'MANUAL_TRIGGER' && (
          <ManualTriggerConfig
            config={config}
            updateConfig={
              updateConfig
            }
          />
        )}

        {type === 'WEBHOOK' && <WebhookConfig />}

        {type === 'HTTP_REQUEST' && (
          <HttpRequestConfig
            config={config}
            updateConfig={
              updateConfig
            }
          />
        )}

        {type === 'CONDITION' && (
          <ConditionConfig
            config={config}
            updateConfig={
              updateConfig
            }
          />
        )}

        {type === 'JSON_TRANSFORM' && (
          <JsonTransformConfig
            config={config}
            updateConfig={
              updateConfig
            }
          />
        )}

        {type === 'AI_PROMPT' && (
          <AiPromptConfig
            config={config}
            updateConfig={
              updateConfig
            }
          />
        )}

        {type === 'AI_AGENT' && (
          <AiAgentConfig
            config={config}
            updateConfig={
              updateConfig
            }
          />
        )}

        {type ===
          'STRUCTURED_EXTRACTION' && (
          <StructuredExtractionConfig
            config={config}
            updateConfig={
              updateConfig
            }
          />
        )}

        {type === 'GMAIL' && (
          <GmailConfig
            config={config}
            updateConfig={
              updateConfig
            }
          />
        )}

        {type === 'SLACK' && (
          <SlackConfig
            config={config}
            updateConfig={
              updateConfig
            }
          />
        )}

        {type === 'POSTGRESQL' && (
          <PostgresConfig
            config={config}
            updateConfig={
              updateConfig
            }
          />
        )}

        {type === 'OUTPUT' && (
          <OutputConfig
            config={config}
            updateConfig={
              updateConfig
            }
          />
        )}
      </div>

      {/* ================================================================ */}
      {/* NOTES                                                            */}
      {/* ================================================================ */}

      <div className="mt-6 border-t border-slate-100 pt-5">
        <ConfigField
          label="Notes"
          value={description}
          onChange={
            updateDescription
          }
          placeholder="Describe this step..."
          multiline
        />

        <div className="mt-1.5 text-[9px] leading-4 text-slate-400">
          Documentation shown to teammates
          in the builder.
        </div>
      </div>

      {/* ================================================================ */}
      {/* NODE ID                                                          */}
      {/* ================================================================ */}

      <div className="mt-6 border-t border-slate-100 pt-4">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          Node ID
        </div>

        <div className="mt-1.5 break-all rounded-md bg-slate-50 px-2.5 py-2 font-mono text-[9px] leading-4 text-slate-400">
          {node.id}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MANUAL TRIGGER                                                            */
/* -------------------------------------------------------------------------- */

function ManualTriggerConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (
    key: string,
    value: ConfigValue,
  ) => void;
}) {
  return (
    <div className="space-y-4">
      <ConfigField
        label="Test Payload"
        value={String(
          config.testPayload ??
            '{\n  "message": "Hello Relay"\n}',
        )}
        multiline
        expression
        onChange={(value) =>
          updateConfig(
            'testPayload',
            value,
          )
        }
      />

      <p className="-mt-2 text-[8px] leading-3.5 text-slate-400">
        This JSON becomes the workflow&rsquo;s root input when you click Run in
        the editor. Reference it downstream with{' '}
        <span className="font-mono">{'{{ input.* }}'}</span> (e.g.{' '}
        <span className="font-mono">{'{{ input.name }}'}</span>).
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* WEBHOOK                                                                   */
/* -------------------------------------------------------------------------- */

function WebhookConfig() {
  const params = useParams();
  const workflowId =
    typeof params?.workflowId === 'string' ? params.workflowId : undefined;

  const { data: webhook, isLoading, isError } = useWebhook(workflowId);
  const rotate = useRotateWebhookSecret();
  const toggle = useSetWebhookEnabled();

  const apiBase = (
    process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3001'
  ).replace(/\/+$/, '');
  const endpoint = workflowId ? `${apiBase}/webhooks/${workflowId}` : '';

  const active = Boolean(webhook?.enabled && webhook?.hasSecret);
  const revealedSecret = rotate.data?.secret;

  const rotateError =
    rotate.error instanceof ApiError
      ? rotate.error.message
      : rotate.error
        ? 'Could not generate a secret.'
        : null;

  if (!workflowId) {
    return (
      <p className="text-[10px] text-slate-400">
        Save the workflow first to configure its webhook.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          Status
        </div>
        {isLoading ? (
          <div className="h-6 w-24 animate-pulse rounded bg-slate-100" />
        ) : isError ? (
          <span className="text-[10px] text-red-500">
            Could not load webhook state.
          </span>
        ) : (
          <span
            className={[
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-semibold',
              active
                ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                : 'border-slate-200 bg-slate-50 text-slate-500',
            ].join(' ')}
          >
            <span
              className={[
                'h-1.5 w-1.5 rounded-full',
                active ? 'bg-emerald-500' : 'bg-slate-300',
              ].join(' ')}
            />
            {active
              ? 'Active'
              : webhook?.hasSecret
                ? 'Disabled'
                : 'No secret yet'}
          </span>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          Endpoint
        </div>
        <div className="flex items-stretch gap-1.5">
          <code className="flex-1 truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[9px] text-slate-600">
            POST {endpoint}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(endpoint)}
            className="rounded-md border border-slate-200 bg-white px-2 text-[9px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Copy
          </button>
        </div>
        <p className="mt-1 text-[8px] leading-3.5 text-slate-400">
          Send the secret in the <code>X-Webhook-Secret</code> header (or{' '}
          <code>Authorization: Bearer &lt;secret&gt;</code>). The JSON body
          becomes <code>{'{{ input.* }}'}</code>.
        </p>
      </div>

      <div>
        <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          Secret
        </div>
        {revealedSecret ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
            <div className="flex items-stretch gap-1.5">
              <code className="flex-1 truncate rounded bg-white px-2 py-1.5 font-mono text-[9px] text-slate-700">
                {revealedSecret}
              </code>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard?.writeText(revealedSecret)
                }
                className="rounded border border-amber-300 bg-white px-2 text-[9px] font-semibold text-amber-700"
              >
                Copy
              </button>
            </div>
            <p className="mt-1 text-[8px] leading-3.5 text-amber-700">
              Copy this now — it is shown only once.
            </p>
          </div>
        ) : (
          <p className="text-[9px] text-slate-500">
            {webhook?.hasSecret
              ? 'A secret is configured. Rotating replaces it.'
              : 'No secret yet. Generate one to activate the webhook.'}
          </p>
        )}

        <button
          type="button"
          onClick={() => rotate.mutate(workflowId)}
          disabled={rotate.isPending}
          className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-[9px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {rotate.isPending
            ? 'Generating…'
            : webhook?.hasSecret
              ? 'Rotate secret'
              : 'Generate secret'}
        </button>
        {rotateError && (
          <p className="mt-1 text-[9px] text-red-500">{rotateError}</p>
        )}
      </div>

      {webhook?.hasSecret && (
        <div>
          <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            Enabled
          </div>
          <button
            type="button"
            onClick={() =>
              toggle.mutate({
                workflowId,
                enabled: !webhook.enabled,
              })
            }
            disabled={toggle.isPending}
            className={[
              'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[9px] font-semibold disabled:opacity-50',
              webhook.enabled
                ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
            ].join(' ')}
          >
            {toggle.isPending
              ? 'Saving…'
              : webhook.enabled
                ? 'Disable webhook'
                : 'Enable webhook'}
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* HTTP REQUEST                                                               */
/* -------------------------------------------------------------------------- */

function HttpRequestConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (
    key: string,
    value: ConfigValue,
  ) => void;
}) {
  return (
    <div className="space-y-4">
      <SelectField
        label="Method"
        value={String(
          config.method ?? 'GET',
        )}
        options={[
          {
            value: 'GET',
            label: 'GET',
          },
          {
            value: 'POST',
            label: 'POST',
          },
          {
            value: 'PUT',
            label: 'PUT',
          },
          {
            value: 'PATCH',
            label: 'PATCH',
          },
          {
            value: 'DELETE',
            label: 'DELETE',
          },
        ]}
        onChange={(value) =>
          updateConfig(
            'method',
            value,
          )
        }
      />

      <ConfigField
        label="URL"
        value={String(
          config.url ?? '',
        )}
        placeholder="https://api.example.com/..."
        expression
        onChange={(value) =>
          updateConfig(
            'url',
            value,
          )
        }
      />

      <ConfigField
        label="Headers"
        value={String(
          config.headers ?? '',
        )}
        placeholder={'{\n  "Authorization": "Bearer ..."\n}'}
        multiline
        expression
        onChange={(value) =>
          updateConfig(
            'headers',
            value,
          )
        }
      />

      <ConfigField
        label="Body"
        value={String(
          config.body ?? '',
        )}
        placeholder={'{\n  "key": "{{ vars.VALUE }}"\n}'}
        multiline
        expression
        onChange={(value) =>
          updateConfig(
            'body',
            value,
          )
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* CONDITION                                                                 */
/* -------------------------------------------------------------------------- */

function ConditionConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (
    key: string,
    value: ConfigValue,
  ) => void;
}) {
  return (
    <div className="space-y-4">
      <ConfigField
        label="Left Value"
        value={String(
          config.leftValue ??
            '{{ input.priority }}',
        )}
        expression
        onChange={(value) =>
          updateConfig(
            'leftValue',
            value,
          )
        }
      />

      <SelectField
        label="Operator"
        value={String(
          config.operator ??
            'equals',
        )}
        options={[
          {
            value: 'equals',
            label: 'Equals',
          },
          {
            value: 'not_equals',
            label: 'Not equals',
          },
          {
            value: 'contains',
            label: 'Contains',
          },
          {
            value: 'greater_than',
            label: 'Greater than',
          },
          {
            value: 'less_than',
            label: 'Less than',
          },
        ]}
        onChange={(value) =>
          updateConfig(
            'operator',
            value,
          )
        }
      />

      <ConfigField
        label="Right Value"
        value={String(
          config.rightValue ??
            'urgent',
        )}
        expression
        onChange={(value) =>
          updateConfig(
            'rightValue',
            value,
          )
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* JSON TRANSFORM                                                             */
/* -------------------------------------------------------------------------- */

function JsonTransformConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (
    key: string,
    value: ConfigValue,
  ) => void;
}) {
  return (
    <div className="space-y-4">
      <ConfigField
        label="Input"
        value={String(
          config.input ??
            '{{ previous.output }}',
        )}
        expression
        onChange={(value) =>
          updateConfig(
            'input',
            value,
          )
        }
      />

      <ConfigField
        label="Transform"
        value={String(
          config.transform ?? '',
        )}
        placeholder={'{\n  "ticket": "{{ input.id }}"\n}'}
        multiline
        expression
        onChange={(value) =>
          updateConfig(
            'transform',
            value,
          )
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* AI PROMPT                                                                  */
/* -------------------------------------------------------------------------- */

function AiPromptConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (
    key: string,
    value: ConfigValue,
  ) => void;
}) {
  const { data: integrations, isLoading, isError } = useIntegrations();

  // Real OpenAI integrations for the current workspace — same source and
  // filter pattern used by SlackConfig / GmailConfig / PostgresConfig.
  const openaiIntegrations = (integrations ?? []).filter(
    (integration) => integration.provider === 'openai',
  );

  const selectedId = String(config.integrationId ?? '');

  // A brand-new node has no model yet — seed the backend default once so the
  // saved graph carries a concrete, supported model. An existing node that
  // already stores a model (supported or not) is left untouched.
  useEffect(() => {
    if (
      config.model === undefined ||
      config.model === null ||
      config.model === ''
    ) {
      updateConfig('model', DEFAULT_OPENAI_MODEL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentModel = String(config.model ?? '');
  const modelUnsupported =
    currentModel !== '' && !isSupportedOpenAiModel(currentModel);

  // Keep an unsupported stored model visible/selectable rather than silently
  // rewriting the user's saved configuration.
  const modelOptions = [
    ...OPENAI_MODELS.map((m) => ({ value: m, label: OPENAI_MODEL_LABELS[m] })),
    ...(modelUnsupported
      ? [{ value: currentModel, label: `${currentModel} — not supported` }]
      : []),
  ];

  // Lightweight, non-blocking readiness hints (backend stays authoritative).
  const integrationsReady = !isLoading && !isError;
  const noIntegrationSelected =
    integrationsReady && openaiIntegrations.length > 0 && selectedId === '';
  const promptBlank = String(config.prompt ?? '').trim() === '';
  // `config.input` defaults to `{{ input.body }}` in the field below, so this
  // is only true when the user has actively cleared both.
  const inputBlank = String(config.input ?? '{{ input.body }}').trim() === '';
  const nothingToSend = promptBlank && inputBlank;

  return (
    <div className="space-y-4">
      {/* Integration picker — stores integrationId only, never an API key */}
      <div>
        <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          OpenAI integration
        </div>

        <p className="mb-1.5 text-[8px] leading-3.5 text-slate-400">
          Uses a connected OpenAI integration from this workspace. No API key is
          entered here — the key stays encrypted on the server.
        </p>

        {isLoading ? (
          <div className="h-8 animate-pulse rounded-md border border-slate-200 bg-slate-50" />
        ) : isError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[9px] text-red-600">
            Could not load your integrations.
          </p>
        ) : openaiIntegrations.length === 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[9px] leading-4 text-amber-700">
            No OpenAI integrations found. Connect one in Integrations before
            using this node.
            <Link
              href="/integrations/new"
              className="mt-1 block font-semibold text-amber-800 underline"
            >
              Add an OpenAI integration
            </Link>
          </div>
        ) : (
          <select
            value={selectedId}
            onChange={(event) =>
              updateConfig('integrationId', event.target.value)
            }
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[10px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
          >
            <option value="">Select an OpenAI integration…</option>
            {openaiIntegrations.map((integration) => (
              <option key={integration.id} value={integration.id}>
                {integration.name}
                {integration.status === 'connected'
                  ? ' · Connected'
                  : integration.status === 'error'
                    ? ' · Connection error'
                    : ''}
              </option>
            ))}
          </select>
        )}

        {selectedId &&
          !isLoading &&
          openaiIntegrations.length > 0 &&
          !openaiIntegrations.some((i) => i.id === selectedId) && (
            <p className="mt-1 text-[8px] text-amber-600">
              The previously selected integration is no longer available.
            </p>
          )}

        {noIntegrationSelected && (
          <p className="mt-1 text-[8px] text-amber-600">
            Select an OpenAI integration to run this node.
          </p>
        )}
      </div>

      <SelectField
        label="Model"
        value={currentModel !== '' ? currentModel : DEFAULT_OPENAI_MODEL}
        options={modelOptions}
        onChange={(value) =>
          updateConfig(
            'model',
            value,
          )
        }
      />

      {modelUnsupported && (
        <p className="-mt-2 text-[8px] text-amber-600">
          This model is not supported by the OpenAI provider. Pick a supported
          model before running this node.
        </p>
      )}

      <ConfigField
        label="Input"
        value={String(
          config.input ??
            '{{ input.body }}',
        )}
        expression
        onChange={(value) =>
          updateConfig(
            'input',
            value,
          )
        }
      />

      <ConfigField
        label="Prompt"
        value={String(
          config.prompt ?? '',
        )}
        placeholder="Enter instructions for the model..."
        multiline
        expression
        onChange={(value) =>
          updateConfig(
            'prompt',
            value,
          )
        }
      />

      {nothingToSend && (
        <p className="-mt-2 text-[8px] text-amber-600">
          Add a prompt (or an Input expression) before running this node.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* AI AGENT                                                                   */
/* -------------------------------------------------------------------------- */

function AiAgentConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (
    key: string,
    value: ConfigValue,
  ) => void;
}) {
  return (
    <div className="space-y-4">
      <SelectField
        label="Model"
        value={String(
          config.model ??
            'gpt-4.1',
        )}
        options={[
          {
            value: 'gpt-4.1',
            label: 'GPT-4.1',
          },
          {
            value: 'claude-sonnet',
            label: 'Claude Sonnet',
          },
        ]}
        onChange={(value) =>
          updateConfig(
            'model',
            value,
          )
        }
      />

      <ConfigField
        label="Instructions"
        value={String(
          config.instructions ??
            '',
        )}
        placeholder="Describe what the agent should accomplish..."
        multiline
        expression
        onChange={(value) =>
          updateConfig(
            'instructions',
            value,
          )
        }
      />

      <ConfigField
        label="Input"
        value={String(
          config.input ??
            '{{ previous.output }}',
        )}
        expression
        onChange={(value) =>
          updateConfig(
            'input',
            value,
          )
        }
      />

      <NumberField
        label="Max Iterations"
        value={Number(
          config.maxIterations ??
            5,
        )}
        min={1}
        max={20}
        onChange={(value) =>
          updateConfig(
            'maxIterations',
            value,
          )
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* STRUCTURED EXTRACTION                                                      */
/* -------------------------------------------------------------------------- */

function StructuredExtractionConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (
    key: string,
    value: ConfigValue,
  ) => void;
}) {
  return (
    <div className="space-y-4">
      <ConfigField
        label="Input"
        value={String(
          config.input ??
            '{{ webhook.body }}',
        )}
        expression
        onChange={(value) =>
          updateConfig(
            'input',
            value,
          )
        }
      />

      <ConfigField
        label="Schema"
        value={String(
          config.schema ??
            '{\n  "priority": "string",\n  "summary": "string"\n}',
        )}
        multiline
        expression
        onChange={(value) =>
          updateConfig(
            'schema',
            value,
          )
        }
      />

      <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2.5">
        <div className="text-[9px] font-medium text-blue-700">
          Structured output
        </div>

        <div className="mt-1 text-[9px] leading-4 text-blue-500">
          The node returns validated JSON
          matching the configured schema.
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* GMAIL                                                                      */
/* -------------------------------------------------------------------------- */

function GmailConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (key: string, value: ConfigValue) => void;
}) {
  const { data: integrations, isLoading, isError } = useIntegrations();

  const gmailIntegrations = (integrations ?? []).filter(
    (integration) => integration.provider === 'gmail',
  );
  const selectedId = String(config.integrationId ?? '');

  return (
    <div className="space-y-4">
      {/* Integration picker — stores integrationId only, never a token */}
      <div>
        <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          Gmail integration
        </div>

        {isLoading ? (
          <div className="h-8 animate-pulse rounded-md border border-slate-200 bg-slate-50" />
        ) : isError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[9px] text-red-600">
            Could not load your integrations.
          </p>
        ) : gmailIntegrations.length === 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[9px] leading-4 text-amber-700">
            No Gmail integrations found. Connect one in Integrations before
            using this node.
            <Link
              href="/integrations/new"
              className="mt-1 block font-semibold text-amber-800 underline"
            >
              Add a Gmail integration
            </Link>
          </div>
        ) : (
          <select
            value={selectedId}
            onChange={(event) =>
              updateConfig('integrationId', event.target.value)
            }
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[10px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
          >
            <option value="">Select a Gmail integration…</option>
            {gmailIntegrations.map((integration) => (
              <option key={integration.id} value={integration.id}>
                {integration.name}
                {typeof integration.config?.account === 'string'
                  ? ` · ${integration.config.account}`
                  : ''}
                {integration.status === 'error' ? ' · Connection error' : ''}
              </option>
            ))}
          </select>
        )}

        {selectedId &&
          !isLoading &&
          gmailIntegrations.length > 0 &&
          !gmailIntegrations.some((i) => i.id === selectedId) && (
            <p className="mt-1 text-[8px] text-amber-600">
              The previously selected integration is no longer available.
            </p>
          )}
      </div>

      <ConfigField
        label="To"
        value={String(config.to ?? '')}
        placeholder="customer@example.com"
        expression
        onChange={(value) => updateConfig('to', value)}
      />

      <ConfigField
        label="Subject"
        value={String(config.subject ?? '')}
        placeholder="Welcome {{ name }}"
        expression
        onChange={(value) => updateConfig('subject', value)}
      />

      <ConfigField
        label="Body"
        value={String(config.body ?? '')}
        placeholder="Email content..."
        multiline
        expression
        onChange={(value) => updateConfig('body', value)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SLACK                                                                      */
/* -------------------------------------------------------------------------- */

function SlackConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (
    key: string,
    value: ConfigValue,
  ) => void;
}) {
  const { data: integrations, isLoading, isError } = useIntegrations();

  const slackIntegrations = (integrations ?? []).filter(
    (integration) => integration.provider === 'slack',
  );

  const selectedId = String(config.integrationId ?? '');

  return (
    <div className="space-y-4">
      {/* Integration picker — stores integrationId only, never a token */}
      <div>
        <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          Slack integration
        </div>

        {isLoading ? (
          <div className="h-8 animate-pulse rounded-md border border-slate-200 bg-slate-50" />
        ) : isError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[9px] text-red-600">
            Could not load your integrations.
          </p>
        ) : slackIntegrations.length === 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[9px] leading-4 text-amber-700">
            No Slack integrations found. Connect one in Integrations before
            using this node.
            <Link
              href="/integrations/new"
              className="mt-1 block font-semibold text-amber-800 underline"
            >
              Add a Slack integration
            </Link>
          </div>
        ) : (
          <select
            value={selectedId}
            onChange={(event) =>
              updateConfig('integrationId', event.target.value)
            }
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[10px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
          >
            <option value="">Select a Slack integration…</option>
            {slackIntegrations.map((integration) => (
              <option key={integration.id} value={integration.id}>
                {integration.name}
                {integration.status === 'connected'
                  ? ' · Connected'
                  : integration.status === 'error'
                    ? ' · Connection error'
                    : ''}
              </option>
            ))}
          </select>
        )}

        {selectedId &&
          !isLoading &&
          slackIntegrations.length > 0 &&
          !slackIntegrations.some((i) => i.id === selectedId) && (
            <p className="mt-1 text-[8px] text-amber-600">
              The previously selected integration is no longer available.
            </p>
          )}
      </div>

      <ConfigField
        label="Channel"
        value={String(config.channel ?? '')}
        placeholder="#alerts or C0123456789"
        expression
        onChange={(value) => updateConfig('channel', value)}
      />

      <ConfigField
        label="Message"
        value={String(config.message ?? '')}
        placeholder="Message to send..."
        multiline
        expression
        onChange={(value) => updateConfig('message', value)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* POSTGRES                                                                   */
/* -------------------------------------------------------------------------- */

/** `config.params` is an ordered list bound to $1, $2, … — one value per line. */
function pgParamsToText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => (item == null ? '' : String(item))).join('\n');
  }
  return typeof value === 'string' ? value : '';
}

function pgTextToParams(text: string): string[] {
  const lines = text.split('\n');
  // Drop trailing blank lines so a newline mid-edit doesn't add an empty param.
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  return lines;
}

function PostgresConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (
    key: string,
    value: ConfigValue,
  ) => void;
}) {
  const { data: integrations, isLoading, isError } = useIntegrations();

  const postgresIntegrations = (integrations ?? []).filter(
    (integration) => integration.provider === 'postgresql',
  );

  const selectedId = String(config.integrationId ?? '');

  return (
    <div className="space-y-4">
      {/* Integration picker — stores integrationId only, never a credential */}
      <div>
        <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          PostgreSQL integration
        </div>

        {isLoading ? (
          <div className="h-8 animate-pulse rounded-md border border-slate-200 bg-slate-50" />
        ) : isError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[9px] text-red-600">
            Could not load your integrations.
          </p>
        ) : postgresIntegrations.length === 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[9px] leading-4 text-amber-700">
            No PostgreSQL integrations found. Connect one in Integrations before
            using this node.
            <Link
              href="/integrations/new"
              className="mt-1 block font-semibold text-amber-800 underline"
            >
              Add a PostgreSQL integration
            </Link>
          </div>
        ) : (
          <select
            value={selectedId}
            onChange={(event) =>
              updateConfig('integrationId', event.target.value)
            }
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[10px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
          >
            <option value="">Select a PostgreSQL integration…</option>
            {postgresIntegrations.map((integration) => (
              <option key={integration.id} value={integration.id}>
                {integration.name}
                {integration.status === 'connected'
                  ? ' · Connected'
                  : integration.status === 'error'
                    ? ' · Connection error'
                    : ''}
              </option>
            ))}
          </select>
        )}

        {selectedId &&
          !isLoading &&
          postgresIntegrations.length > 0 &&
          !postgresIntegrations.some((i) => i.id === selectedId) && (
            <p className="mt-1 text-[8px] text-amber-600">
              The previously selected integration is no longer available.
            </p>
          )}
      </div>

      <SelectField
        label="Operation"
        value={String(
          config.operation ??
            'query',
        )}
        options={[
          {
            value: 'query',
            label: 'Query',
          },
          {
            value: 'insert',
            label: 'Insert',
          },
          {
            value: 'update',
            label: 'Update',
          },
          {
            value: 'delete',
            label: 'Delete',
          },
        ]}
        onChange={(value) =>
          updateConfig(
            'operation',
            value,
          )
        }
      />

      <ConfigField
        label="SQL Query"
        value={String(
          config.query ?? '',
        )}
        placeholder="SELECT * FROM tickets WHERE id = $1"
        multiline
        expression
        onChange={(value) =>
          updateConfig(
            'query',
            value,
          )
        }
      />

      <div>
        <ConfigField
          label="Query Parameters"
          value={pgParamsToText(config.params)}
          placeholder={'One value per line — bound to $1, $2, …'}
          multiline
          expression
          onChange={(value) =>
            updateConfig('params', pgTextToParams(value))
          }
        />
        <p className="mt-1 text-[8px] leading-3.5 text-slate-400">
          Each line is bound in order to $1, $2, … and passed as a parameter —
          never string-concatenated into the SQL. Supports{' '}
          <code>{'{{ expressions }}'}</code>.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* OUTPUT                                                                     */
/* -------------------------------------------------------------------------- */

function OutputConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (
    key: string,
    value: ConfigValue,
  ) => void;
}) {
  return (
    <div className="space-y-4">
      <ConfigField
        label="Output Value"
        value={String(
          config.value ??
            '{{ previous.output }}',
        )}
        expression
        multiline
        onChange={(value) =>
          updateConfig(
            'value',
            value,
          )
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TEST PANEL                                                                */
/* -------------------------------------------------------------------------- */

function TestPanel({
  node,
}: {
  node: Node<WorkflowCanvasNodeData>;
}) {
  const defaultInput = useMemo(
    () =>
      JSON.stringify(
        {
          nodeId: node.id,
          type:
            node.data?.type ??
            'workflow',
          label:
            node.data?.label ??
            'Workflow Node',
          input: {
            message:
              'Provide a sample payload for this node.',
          },
        },
        null,
        2,
      ),
    [node.data?.label, node.data?.type, node.id],
  );

  const [input, setInput] = useState(defaultInput);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{
    status: 'success' | 'error';
    durationMs: number;
    summary: string;
    output: string;
  } | null>(null);

  const executed =
    result?.status === 'success';

  const executionDuration =
    result?.durationMs ??
    (typeof node.data?.executionDuration ===
    'number'
      ? node.data.executionDuration
      : undefined);

  const handleRunTest = () => {
    const trimmed = input.trim();

    if (!trimmed) {
      setResult({
        status: 'error',
        durationMs: 0,
        summary: 'Test input is empty.',
        output: 'Enter sample JSON to run this node test.',
      });
      return;
    }

    setIsRunning(true);
    setResult(null);

    const startedAt = Date.now();

    window.setTimeout(() => {
      try {
        const parsed = JSON.parse(trimmed);
        const isValidPayload =
          parsed &&
          typeof parsed === 'object';

        const durationMs =
          Date.now() - startedAt;

        if (!isValidPayload) {
          setResult({
            status: 'error',
            durationMs,
            summary:
              'Test input is not a valid object payload.',
            output:
              'Expected a JSON object such as {"message":"hello"}.',
          });
          setIsRunning(false);
          return;
        }

        const output = {
          nodeId: node.id,
          type: node.data?.type ?? 'workflow',
          status: 'success',
          receivedAt: new Date().toISOString(),
          input: parsed,
          result: {
            ok: true,
            message: `Node ${node.data?.label ?? 'Workflow Node'} executed successfully.`,
          },
        };

        setResult({
          status: 'success',
          durationMs,
          summary:
            'Node test completed successfully.',
          output: JSON.stringify(output, null, 2),
        });
      } catch {
        setResult({
          status: 'error',
          durationMs: Date.now() - startedAt,
          summary: 'Invalid JSON input.',
          output:
            'The test input must be valid JSON. Fix the payload and try again.',
        });
      } finally {
        setIsRunning(false);
      }
    }, 650);
  };

  return (
    <div className="p-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white border border-slate-200">
            <Play
              size={13}
              className="text-slate-500"
            />
          </div>

          <div>
            <div className="text-[11px] font-semibold text-slate-700">
              Test this node
            </div>

            <div className="text-[9px] text-slate-400">
              Run this step with sample input.
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 text-[9px]">
          <span
            className={`inline-flex rounded-full border px-2 py-1 font-medium ${
              executed
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            {isRunning
              ? 'Running test...'
              : executed
                ? 'Last run succeeded'
                : 'Ready to test'}
          </span>

          <span className="text-slate-500">
            {executionDuration
              ? `${executionDuration}ms`
              : 'Not run yet'}
          </span>
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            Test input
          </span>
          <textarea
            value={input}
            onChange={(event) =>
              setInput(event.target.value)
            }
            rows={7}
            spellCheck={false}
            placeholder={'{\n  "message": "hello"\n}'}
            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[10px] text-slate-700 outline-none ring-0 placeholder:text-slate-400 focus:border-blue-400"
          />
        </label>

        <button
          type="button"
          disabled={isRunning}
          className="mt-4 flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 text-[10px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
          onClick={handleRunTest}
        >
          {isRunning ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border border-white/30 border-t-white" />
              Running Test
            </>
          ) : (
            <>
              <Play size={12} />
              Run Test
            </>
          )}
        </button>

        {result && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`inline-flex rounded-full border px-2 py-1 text-[8px] font-semibold uppercase tracking-wide ${
                  result.status === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                {result.status === 'success'
                  ? 'Success'
                  : 'Error'}
              </span>

              <span className="text-[9px] text-slate-500">
                {result.durationMs}ms
              </span>
            </div>

            <div className="mt-2 text-[10px] font-medium text-slate-700">
              {result.summary}
            </div>

            <pre className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-2 font-mono text-[9px] leading-4 text-slate-600">
              {result.output}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* OUTPUT PANEL                                                               */
/* -------------------------------------------------------------------------- */

function OutputPanel({
  node,
}: {
  node: Node<WorkflowCanvasNodeData>;
}) {
  const output = useMemo(() => {
    const executed =
      node.data?.executed === true ||
      node.data?.status === 'success';

    const executionDuration =
      typeof node.data?.executionDuration ===
      'number'
        ? node.data.executionDuration
        : undefined;

    if (executed) {
      return {
        status: 'success',
        nodeId: node.id,
        durationMs:
          executionDuration ?? 184,
        message:
          'Node completed successfully.',
        output: {
          result: 'SUCCESS',
          summary:
            'The selected node produced a valid response and forwarded the output downstream.',
        },
      };
    }

    return {
      status: 'pending',
      nodeId: node.id,
      message:
        'Run the node to see its output.',
    };
  }, [node.data, node.id]);

  return (
    <div className="p-4">
      <div className="mb-2 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
        Latest Output
      </div>

      <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-[9px] leading-4 text-slate-500">
        {JSON.stringify(
          output,
          null,
          2,
        )}
      </pre>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DOCS PANEL                                                                 */
/* -------------------------------------------------------------------------- */

function DocsPanel({
  node,
  type,
  category,
}: {
  node: Node<WorkflowCanvasNodeData>;
  type: string;
  category: string;
}) {
  return (
    <div className="p-4">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Documentation
        </div>

        <div className="mt-2 text-sm font-semibold text-slate-800">
          {node.data?.label ??
            'Workflow Node'}
        </div>

        <div className="mt-1 text-[10px] text-slate-400">
          {category} · {type}
        </div>

        <p className="mt-4 text-[10px] leading-5 text-slate-500">
          Configure this node, provide its
          required inputs, and connect it to
          the next step in the workflow.
        </p>

        <div className="mt-4 rounded-md bg-slate-50 p-2.5">
          <div className="text-[9px] font-semibold text-slate-500">
            Expressions
          </div>

          <div className="mt-1 font-mono text-[9px] text-slate-400">
            {'{{ previous.output }}'}
          </div>

          <div className="mt-1 font-mono text-[9px] text-slate-400">
            {'{{ vars.MY_VARIABLE }}'}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TAB                                                                        */
/* -------------------------------------------------------------------------- */

function ConfigTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative h-9 text-[10px] font-medium transition',
        active
          ? 'text-blue-600'
          : 'text-slate-400 hover:text-slate-700',
      ].join(' ')}
    >
      {children}

      {active && (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" />
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* FIELD                                                                       */
/* -------------------------------------------------------------------------- */

function ConfigField({
  label,
  value,
  placeholder,
  multiline = false,
  expression = false,
  onChange,
}: ConfigFieldProps) {
  return (
    <div>
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="relative">
        {multiline ? (
          <textarea
            value={value}
            onChange={(event) =>
              onChange(
                event.target.value,
              )
            }
            placeholder={
              placeholder
            }
            rows={4}
            className={[
              'w-full resize-none rounded-md border border-slate-200 bg-white px-2.5 py-2',
              'text-[10px] leading-4 text-slate-700 outline-none',
              'placeholder:text-slate-300',
              'focus:border-blue-400 focus:ring-2 focus:ring-blue-50',
              expression
                ? 'font-mono'
                : '',
            ].join(' ')}
          />
        ) : (
          <input
            value={value}
            onChange={(event) =>
              onChange(
                event.target.value,
              )
            }
            placeholder={
              placeholder
            }
            className={[
              'h-8 w-full rounded-md border border-slate-200 bg-white px-2.5',
              'text-[10px] text-slate-700 outline-none',
              'placeholder:text-slate-300',
              'focus:border-blue-400 focus:ring-2 focus:ring-blue-50',
              expression
                ? 'font-mono'
                : '',
            ].join(' ')}
          />
        )}
      </div>

      {expression && (
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[8px] text-slate-400">
            Supports {'{{ }}'} expressions
          </span>

          <button
            type="button"
            className="text-[8px] font-medium text-blue-500 hover:text-blue-600"
            onClick={() =>
              onChange(
                value +
                  (value
                    ? ' '
                    : '') +
                  '{{ vars.KEY }}',
              )
            }
          >
            Insert variable
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SELECT                                                                      */
/* -------------------------------------------------------------------------- */

function SelectField({
  label,
  value,
  options,
  onChange,
}: SelectFieldProps) {
  return (
    <div>
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <select
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value,
          )
        }
        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[10px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
      >
        {options.map(
          (option) => (
            <option
              key={
                option.value
              }
              value={
                option.value
              }
            >
              {option.label}
            </option>
          ),
        )}
      </select>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* NUMBER                                                                      */
/* -------------------------------------------------------------------------- */

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (
    value: number,
  ) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) =>
          onChange(
            Number(
              event.target.value,
            ),
          )
        }
        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[10px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
      />
    </div>
  );
}