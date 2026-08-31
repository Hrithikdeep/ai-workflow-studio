'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';
import {
  getWorkflow,
  getWorkflowGraph,
  getWorkflowVersions,
  updateWorkflowGraph,
} from '@/lib/api/workflows';
import { runExecution } from '@/lib/api/executions';
import { usePublishWorkflowVersion } from '@/hooks/use-workflows';
import NodeConfigPanel from '@/components/editor/node-config-panel';
import WorkflowEditorLayout from '@/components/editor/workflow-editor-layout';
import WorkflowEditorHeader from '@/components/editor/workflow-editor-header';
import WorkflowCanvas, {
  type WorkflowCanvasNodeData,
} from '@/components/editor/workflow-canvas';
import type {
  ValidationResult,
} from '@/components/editor/workflow-validation';

import type {
  Edge,
  Node,
} from 'reactflow';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type WorkflowEditorPageClientProps = {
  workflowId: string;
  versionId?: string;
};

type PaletteNode = {
  type: string;
  label: string;
  description: string;
};

type PaletteGroup = {
  title: string;
  nodes: PaletteNode[];
};

type SidebarTab =
  | 'nodes'
  | 'variables'
  | 'workflow';

type WorkflowVariable = {
  id: string;
  key: string;
  value: string;
};

/* -------------------------------------------------------------------------- */
/* History                                                                    */
/* -------------------------------------------------------------------------- */

type GraphSnapshot = {
  nodes: Node<WorkflowCanvasNodeData>[];
  edges: Edge[];
};

/* -------------------------------------------------------------------------- */
/* Palette                                                                    */
/* -------------------------------------------------------------------------- */

const PALETTE_GROUPS: PaletteGroup[] = [
  {
    title: 'Triggers',
    nodes: [
      {
        type: 'MANUAL_TRIGGER',
        label: 'Manual Input',
        description:
          'Run on demand with test payload',
      },
      {
        type: 'WEBHOOK',
        label: 'Webhook',
        description:
          'Trigger from an HTTP endpoint',
      },
    ],
  },

  {
    title: 'Logic & Data',
    nodes: [
      {
        type: 'HTTP_REQUEST',
        label: 'HTTP Request',
        description:
          'Call any REST API',
      },
      {
        type: 'CONDITION',
        label: 'Condition',
        description:
          'Branch on a comparison',
      },
      {
        type: 'JSON_TRANSFORM',
        label: 'JSON Transform',
        description:
          'Reshape payloads',
      },
    ],
  },

  {
    title: 'AI',
    nodes: [
      {
        type: 'AI_PROMPT',
        label: 'AI Prompt',
        description:
          'Single-shot model call',
      },
      {
        type: 'AI_AGENT',
        label: 'AI Agent',
        description:
          'Tool-using reasoning loop',
      },
      {
        type: 'STRUCTURED_EXTRACTION',
        label: 'Structured Extraction',
        description:
          'Typed JSON from text',
      },
    ],
  },

  {
    title: 'Integrations',
    nodes: [
      {
        type: 'GMAIL',
        label: 'Gmail',
        description:
          'Send email',
      },
      {
        type: 'SLACK',
        label: 'Slack',
        description:
          'Post to a channel',
      },
    ],
  },

  {
    title: 'Data',
    nodes: [
      {
        type: 'POSTGRESQL',
        label: 'PostgreSQL',
        description:
          'Read or write rows',
      },
    ],
  },

  {
    title: 'Output',
    nodes: [
      {
        type: 'OUTPUT',
        label: 'Output',
        description:
          'Return the workflow result',
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Initial Variables                                                          */
/* -------------------------------------------------------------------------- */

const INITIAL_VARIABLES: WorkflowVariable[] = [
  {
    id: 'support-channel',
    key: 'SUPPORT_CHANNEL',
    value: '#support-alerts',
  },

  {
    id: 'severity-threshold',
    key: 'SEVERITY_THRESHOLD',
    value: '0.75',
  },

  {
    id: 'max-agent-steps',
    key: 'MAX_AGENT_STEPS',
    value: '5',
  },
];

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function WorkflowEditorPageClient({
  workflowId,
  versionId,
}: WorkflowEditorPageClientProps) {
  const router = useRouter();

  /* ------------------------------------------------------------------------ */
  /* Sidebar                                                                  */
  /* ------------------------------------------------------------------------ */

  const [activeTab, setActiveTab] =
    useState<SidebarTab>('nodes');

  const [nodeSearch, setNodeSearch] =
    useState('');

  /* ------------------------------------------------------------------------ */
  /* Graph state                                                              */
  /* ------------------------------------------------------------------------ */

  const [nodes, setNodes] = useState<
    Node<WorkflowCanvasNodeData>[]
  >([]);

  const [edges, setEdges] = useState<Edge[]>(
    [],
  );

  /* ------------------------------------------------------------------------ */
  /* Selection                                                                */
  /* ------------------------------------------------------------------------ */

  const [selectedNode, setSelectedNode] =
    useState<
      Node<WorkflowCanvasNodeData> | null
    >(null);

  /* ------------------------------------------------------------------------ */
  /* Variables                                                                */
  /* ------------------------------------------------------------------------ */

  const [variables, setVariables] =
    useState<WorkflowVariable[]>(
      INITIAL_VARIABLES,
    );

  /* ------------------------------------------------------------------------ */
  /* Workflow metadata                                                        */
  /* ------------------------------------------------------------------------ */

  const [workflowName, setWorkflowName] =
    useState('Untitled Workflow');

  const [workflowDescription, setWorkflowDescription] =
    useState('');

  const [workflowOwner, setWorkflowOwner] =
    useState('platform-team');

  const [workflowStatus, setWorkflowStatus] =
    useState<'DRAFT' | 'PUBLISHED'>('DRAFT');

  const [workflowVersion, setWorkflowVersion] =
    useState('v1 (draft)');

  const [workflowTags, setWorkflowTags] =
    useState<string[]>([
      'support',
      'ai-agent',
    ]);

  const [workflowTimeout, setWorkflowTimeout] =
    useState('60s');

  const [workflowRetries, setWorkflowRetries] =
    useState('3');

  const [workflowConcurrency, setWorkflowConcurrency] =
    useState('10');

  /* ------------------------------------------------------------------------ */
  /* Save state                                                               */
  /* ------------------------------------------------------------------------ */

  const [resolvedVersionId, setResolvedVersionId] =
    useState<string | null>(versionId ?? null);

  const [saveStatus, setSaveStatus] =
    useState<
      'saved' | 'saving' | 'unsaved'
    >('saved');

  const [saveError, setSaveError] =
    useState<string | null>(null);

  const [validationResults, setValidationResults] =
    useState<ValidationResult[]>([]);

  const [executionSummary, setExecutionSummary] =
    useState<{
      status: 'success';
      label: string;
      executionId?: string;
      nodeId?: string;
    } | null>(null);

  // Guards against duplicate Run submissions; also drives the header's
  // disabled/label state. Not a second execution state machine.
  const [isRunning, setIsRunning] = useState(false);

  /* ------------------------------------------------------------------------ */
  /* History                                                                  */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!workflowId) {
      return;
    }

    let active = true;

    const loadWorkflowMeta = async () => {
      try {
        const workflow = await getWorkflow(
          workflowId,
        );

        if (!active) {
          return;
        }

        if (workflow?.name) {
          setWorkflowName(workflow.name);
        }

        if (workflow?.description) {
          setWorkflowDescription(
            workflow.description,
          );
        }

        const versions = await getWorkflowVersions(
          workflowId,
        );

        if (!active) {
          return;
        }

        const latestVersion =
          versions?.length
            ? [...versions].sort(
                (a, b) =>
                  (b.version ?? 0) -
                  (a.version ?? 0),
              )[0]
            : null;

        if (latestVersion) {
          setResolvedVersionId(latestVersion.id);
          const normalizedVersionLabel = `v${latestVersion.version ?? 1}${latestVersion.isPublished ? ' (published)' : ' (draft)'}`;
          setWorkflowVersion(
            normalizedVersionLabel,
          );
          setWorkflowStatus(
            latestVersion.isPublished ? 'PUBLISHED' : 'DRAFT',
          );
        }
      } catch (error) {
        console.error(
          '[Relay] Failed to load workflow metadata:',
          error,
        );
        router.replace('/workflows');
      }
    };

    void loadWorkflowMeta();

    return () => {
      active = false;
    };
  }, [workflowId, router]);

  useEffect(() => {
    if (!resolvedVersionId) {
      return;
    }

    let active = true;

    const loadGraph = async () => {
      try {
        const graph = await getWorkflowGraph(
          resolvedVersionId,
        );

        if (!active) {
          return;
        }

        if (Array.isArray(graph?.nodes)) {
          setNodes(
            graph.nodes.map((node) => ({
              id: node.id,
              type: 'workflow',
              position: {
                x: node.positionX ?? 0,
                y: node.positionY ?? 0,
              },
              data: {
                label:
                  node.label ??
                  node.type ??
                  'Node',
                type: node.type ?? 'default',
                description:
                  node.config &&
                  typeof node.config === 'object'
                    ? String(
                        (node.config as Record<string, unknown>)
                          .description ?? '',
                      )
                    : '',
                config: (node.config as Record<string, unknown>) ?? {},
              },
              draggable: true,
              selectable: true,
              connectable: true,
            })),
          );
        }

        if (Array.isArray(graph?.edges)) {
          setEdges(
            graph.edges.map((edge) => ({
              id: edge.id,
              source: edge.sourceNodeId,
              target: edge.targetNodeId,
              sourceHandle:
                edge.sourceHandle ?? undefined,
              targetHandle:
                edge.targetHandle ?? undefined,
              animated: false,
            })),
          );
        }
      } catch (error) {
        console.error(
          '[Relay] Failed to load workflow graph:',
          error,
        );
        setNodes([]);
        setEdges([]);
      }
    };

    void loadGraph();

    return () => {
      active = false;
    };
  }, [resolvedVersionId]);

  const historyRef = useRef<
    GraphSnapshot[]
  >([]);

  const historyIndexRef =
    useRef(-1);

  const historyLockedRef =
    useRef(false);

  const [historyVersion, setHistoryVersion] =
    useState(0);

  const forceHistoryUpdate = useCallback(
    () => {
      setHistoryVersion(
        (current) =>
          current + 1,
      );
    },
    [],
  );

  /* ------------------------------------------------------------------------ */
  /* Canvas ref                                                               */
  /* ------------------------------------------------------------------------ */

  const canvasRef = useRef<{
    fitView: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
    toggleGrid: () => void;
  } | null>(null);

  /* ------------------------------------------------------------------------ */
  /* Filtered palette                                                         */
  /* ------------------------------------------------------------------------ */

  const filteredPaletteGroups =
    useMemo(() => {
      const query =
        nodeSearch
          .trim()
          .toLowerCase();

      if (!query) {
        return PALETTE_GROUPS;
      }

      return PALETTE_GROUPS
        .map((group) => ({
          ...group,

          nodes: group.nodes.filter(
            (node) =>
              node.label
                .toLowerCase()
                .includes(query) ||
              node.description
                .toLowerCase()
                .includes(query) ||
              node.type
                .toLowerCase()
                .includes(query),
          ),
        }))
        .filter(
          (group) =>
            group.nodes.length > 0,
        );
    }, [nodeSearch]);

  /* ------------------------------------------------------------------------ */
  /* Snapshot helper                                                          */
  /* ------------------------------------------------------------------------ */

  const createSnapshot =
    useCallback(
      (
        snapshotNodes: Node<WorkflowCanvasNodeData>[],
        snapshotEdges: Edge[],
      ): GraphSnapshot => ({
        nodes: snapshotNodes.map(
          (node) => ({
            ...node,
            position: {
              ...node.position,
            },
            data: {
              ...node.data,
              config: node.data?.config
                ? {
                    ...node.data
                      .config,
                  }
                : {},
            },
          }),
        ),

        edges: snapshotEdges.map(
          (edge) => ({
            ...edge,
          }),
        ),
      }),
      [],
    );

  /* ------------------------------------------------------------------------ */
  /* Record history                                                           */
  /* ------------------------------------------------------------------------ */

  const recordHistory =
    useCallback(
      (
        nextNodes: Node<WorkflowCanvasNodeData>[],
        nextEdges: Edge[],
      ) => {
        if (
          historyLockedRef.current
        ) {
          return;
        }

        const snapshot =
          createSnapshot(
            nextNodes,
            nextEdges,
          );

        const currentIndex =
          historyIndexRef.current;

        const currentHistory =
          historyRef.current;

        const trimmedHistory =
          currentHistory.slice(
            0,
            currentIndex + 1,
          );

        trimmedHistory.push(
          snapshot,
        );

        const MAX_HISTORY = 100;

        if (
          trimmedHistory.length >
          MAX_HISTORY
        ) {
          trimmedHistory.shift();
        }

        historyRef.current =
          trimmedHistory;

        historyIndexRef.current =
          trimmedHistory.length - 1;

        forceHistoryUpdate();
      },
      [
        createSnapshot,
        forceHistoryUpdate,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* Initialize history once                                                  */
  /* ------------------------------------------------------------------------ */

  const historyInitializedRef =
    useRef(false);

  if (
    !historyInitializedRef.current
  ) {
    historyInitializedRef.current =
      true;

    historyRef.current = [
      createSnapshot([], []),
    ];

    historyIndexRef.current =
      0;
  }

  /* ------------------------------------------------------------------------ */
  /* Apply graph snapshot                                                     */
  /* ------------------------------------------------------------------------ */

  const applySnapshot =
    useCallback(
      (snapshot: GraphSnapshot) => {
        historyLockedRef.current =
          true;

        const nextNodes =
          snapshot.nodes.map(
            (node) => ({
              ...node,

              position: {
                ...node.position,
              },

              data: {
                ...node.data,

                config:
                  node.data?.config
                    ? {
                        ...node
                          .data
                          .config,
                      }
                    : {},
              },
            }),
          );

        const nextEdges =
          snapshot.edges.map(
            (edge) => ({
              ...edge,
            }),
          );

        setNodes(nextNodes);
        setEdges(nextEdges);

        setSelectedNode(
          (current) => {
            if (!current) {
              return null;
            }

            return (
              nextNodes.find(
                (node) =>
                  node.id ===
                  current.id,
              ) ?? null
            );
          },
        );

        historyLockedRef.current =
          false;
      },
      [],
    );

  /* ------------------------------------------------------------------------ */
  /* Undo                                                                      */
  /* ------------------------------------------------------------------------ */

  const handleUndo =
    useCallback(() => {
      const currentIndex =
        historyIndexRef.current;

      if (
        currentIndex <= 0
      ) {
        return;
      }

      const previousIndex =
        currentIndex - 1;

      const previousSnapshot =
        historyRef.current[
          previousIndex
        ];

      if (!previousSnapshot) {
        return;
      }

      historyIndexRef.current =
        previousIndex;

      applySnapshot(
        previousSnapshot,
      );

      setSaveStatus('unsaved');

      forceHistoryUpdate();
    }, [
      applySnapshot,
      forceHistoryUpdate,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Redo                                                                      */
  /* ------------------------------------------------------------------------ */

  const handleRedo =
    useCallback(() => {
      const currentIndex =
        historyIndexRef.current;

      const lastIndex =
        historyRef.current
          .length - 1;

      if (
        currentIndex >=
        lastIndex
      ) {
        return;
      }

      const nextIndex =
        currentIndex + 1;

      const nextSnapshot =
        historyRef.current[
          nextIndex
        ];

      if (!nextSnapshot) {
        return;
      }

      historyIndexRef.current =
        nextIndex;

      applySnapshot(
        nextSnapshot,
      );

      setSaveStatus('unsaved');

      forceHistoryUpdate();
    }, [
      applySnapshot,
      forceHistoryUpdate,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Node selection                                                           */
  /* ------------------------------------------------------------------------ */

  const handleNodeSelect =
    useCallback(
      (
        node: Node<WorkflowCanvasNodeData> | null,
      ) => {
        setSelectedNode(node);
      },
      [],
    );

  /* ------------------------------------------------------------------------ */
  /* Graph change                                                             */
  /* ------------------------------------------------------------------------ */

  const handleGraphChange =
    useCallback(
      (
        nextNodes: Node<WorkflowCanvasNodeData>[],
        nextEdges: Edge[],
      ) => {
        setNodes(nextNodes);
        setEdges(nextEdges);

        setSelectedNode(
          (current) => {
            if (!current) {
              return null;
            }

            return (
              nextNodes.find(
                (node) =>
                  node.id ===
                  current.id,
              ) ?? null
            );
          },
        );

        setSaveStatus(
          'unsaved',
        );

        /*
         * Every real graph mutation becomes
         * a history snapshot.
         */
        recordHistory(
          nextNodes,
          nextEdges,
        );
      },
      [recordHistory],
    );

  /* ------------------------------------------------------------------------ */
  /* External node change                                                     */
  /* ------------------------------------------------------------------------ */

  const handleNodesChange =
    useCallback(
      (
        nextNodes: Node<WorkflowCanvasNodeData>[],
      ) => {
        setNodes(nextNodes);

        setSelectedNode(
          (current) => {
            if (!current) {
              return null;
            }

            return (
              nextNodes.find(
                (node) =>
                  node.id ===
                  current.id,
              ) ?? null
            );
          },
        );

        setSaveStatus(
          'unsaved',
        );
      },
      [],
    );

  /* ------------------------------------------------------------------------ */
  /* External edge change                                                     */
  /* ------------------------------------------------------------------------ */

  const handleEdgesChange =
    useCallback(
      (
        nextEdges: Edge[],
      ) => {
        setEdges(nextEdges);

        setSaveStatus(
          'unsaved',
        );
      },
      [],
    );

  /* ------------------------------------------------------------------------ */
  /* Delete selected node                                                     */
  /* ------------------------------------------------------------------------ */

  const handleDelete =
    useCallback(() => {
      if (!selectedNode) {
        return;
      }

      const nodeId =
        selectedNode.id;

      const nextNodes =
        nodes.filter(
          (node) =>
            node.id !==
            nodeId,
        );

      const nextEdges =
        edges.filter(
          (edge) =>
            edge.source !==
              nodeId &&
            edge.target !==
              nodeId,
        );

      setNodes(nextNodes);
      setEdges(nextEdges);
      setSelectedNode(null);
      setSaveStatus('unsaved');

      recordHistory(
        nextNodes,
        nextEdges,
      );
    }, [
      selectedNode,
      nodes,
      edges,
      recordHistory,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Duplicate selected node                                                  */
  /* ------------------------------------------------------------------------ */

  const handleDuplicate =
    useCallback(() => {
      if (!selectedNode) {
        return;
      }

      const newId =
        typeof crypto !==
          'undefined' &&
        typeof crypto.randomUUID ===
          'function'
          ? crypto.randomUUID()
          : `node-${Date.now()}`;

      const duplicate: Node<WorkflowCanvasNodeData> =
        {
          ...selectedNode,

          id: newId,

          position: {
            x:
              selectedNode
                .position.x + 40,
            y:
              selectedNode
                .position.y + 40,
          },

          selected: true,

          data: {
            ...selectedNode.data,

            config:
              selectedNode.data
                ?.config
                ? {
                    ...selectedNode
                      .data
                      .config,
                  }
                : {},
          },
        };

      const nextNodes = [
        ...nodes.map(
          (node) => ({
            ...node,
            selected: false,
          }),
        ),
        duplicate,
      ];

      setNodes(nextNodes);
      setSelectedNode(
        duplicate,
      );
      setSaveStatus('unsaved');

      recordHistory(
        nextNodes,
        edges,
      );
    }, [
      selectedNode,
      nodes,
      edges,
      recordHistory,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Node config change                                                       */
  /* ------------------------------------------------------------------------ */

  const handleNodeConfigChange =
    useCallback(
      (
        nodeId: string,
        config: Record<string, unknown>,
        label?: string,
        description?: string,
      ) => {
        setNodes((current) =>
          current.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...(n.data ?? {}),
                    config,
                    label: label ?? n.data?.label,
                    description:
                      description ?? n.data?.description,
                  },
                }
              : n,
          ),
        );

        setSelectedNode((current) =>
          current && current.id === nodeId
            ? {
                ...current,
                data: {
                  ...(current.data ?? {}),
                  config,
                  label: label ?? current.data?.label,
                  description:
                    description ?? current.data?.description,
                },
              }
            : current,
        );

        setSaveStatus('unsaved');
      },
      [],
    );

  /* ------------------------------------------------------------------------ */
  /* Fit view                                                                 */
  /* ------------------------------------------------------------------------ */

  const handleFitView =
    useCallback(() => {
      canvasRef.current?.fitView();
    }, []);

  const handleToggleGrid =
    useCallback(() => {
      canvasRef.current?.toggleGrid();
    }, []);

  const handleZoomIn =
    useCallback(() => {
      canvasRef.current?.zoomIn();
    }, []);

  const handleZoomOut =
    useCallback(() => {
      canvasRef.current?.zoomOut();
    }, []);

  /* ------------------------------------------------------------------------ */
  /* Save persistence                                                          */
  /* ------------------------------------------------------------------------ */

  const storageKey =
    typeof window !== 'undefined' && resolvedVersionId
      ? `workflow-editor:${workflowId}:${resolvedVersionId}`
      : null;

  const persistWorkflowState = useCallback(
    (
      nextNodes: Node<WorkflowCanvasNodeData>[],
      nextEdges: Edge[],
    ) => {
      if (!storageKey) {
        return;
      }

      const payload = {
        nodes: nextNodes,
        edges: nextEdges,
        savedAt: new Date().toISOString(),
      };

      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify(payload),
        );
      } catch (error) {
        console.error(
          '[Relay] Failed to persist workflow state locally:',
          error,
        );
      }
    },
    [storageKey],
  );

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    try {
      const raw =
        window.localStorage.getItem(
          storageKey,
        );

      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as {
        nodes?: Node<WorkflowCanvasNodeData>[];
        edges?: Edge[];
      };

      if (Array.isArray(parsed.nodes)) {
        setNodes(parsed.nodes);
      }

      if (Array.isArray(parsed.edges)) {
        setEdges(parsed.edges);
      }

      setSaveStatus('saved');
    } catch (error) {
      console.error(
        '[Relay] Failed to restore workflow state:',
        error,
      );
      window.localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  /* ------------------------------------------------------------------------ */
  /* Save                                                                      */
  /* ------------------------------------------------------------------------ */

  const handleSave = useCallback(async () => {
  if (!resolvedVersionId) {
    setSaveStatus('unsaved');
    setSaveError('Missing workflow version.');
    return;
  }

  setSaveStatus('saving');
  setSaveError(null);

  try {
    // Serialize React Flow nodes/edges into the backend graph shape.
    // Keep React Flow's `node.type === 'workflow'` for rendering, but
    // send the domain node type from `node.data.type` to the API.
    const payloadNodes = nodes.map((n) => ({
      id: n.id,
      // Ensure a non-empty domain type so backend enum mapping doesn't fail.
      type: String(n.data?.type ?? 'MANUAL_TRIGGER'),
      label: n.data?.label ?? n.data?.type ?? 'Node',
      positionX: Number(n.position?.x ?? 0),
      positionY: Number(n.position?.y ?? 0),
      config: (n.data?.config ?? {}) as Record<string, unknown>,
    }));

    // Guarantee every edge has an id. Log missing endpoints but include
    // edges in the payload so the backend can validate and persist them
    // atomically with the nodes. Avoid dropping edges here which caused
    // false disconnected-node validation after reload.
    const payloadEdges = edges
      .map((e) => {
      const rawId = (e as any).id;

      const id = rawId ?? (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `edge-${Date.now()}-${Math.random().toString(36).slice(2)}`);

      const sourceNodeId = (e as any).source ?? (e as any).sourceNodeId ?? null;
      const targetNodeId = (e as any).target ?? (e as any).targetNodeId ?? null;

      if (!sourceNodeId || !targetNodeId) {
        console.warn('[Relay] Dropping incomplete edge (missing source/target):', { id, sourceNodeId, targetNodeId });

        return null;
      }

      return {
        id,
        sourceNodeId,
        targetNodeId,
        sourceHandle: (e as any).sourceHandle ?? null,
        targetHandle: (e as any).targetHandle ?? null,
      } as const;
    })
    .filter(Boolean) as Array<{
      id: string;
      sourceNodeId: string | null;
      targetNodeId: string | null;
      sourceHandle: string | null;
      targetHandle: string | null;
    }>;

    await updateWorkflowGraph(resolvedVersionId, {
      nodes: payloadNodes,
      edges: payloadEdges,
    });

    // Backend is the source of truth.
    // Only persist locally after a successful backend save.
    persistWorkflowState(nodes, edges);

    setSaveStatus('saved');
  } catch (error) {
    console.error('[Relay] Workflow save failed:', error);

    setSaveError(
      error instanceof Error
        ? error.message
        : 'Failed to save workflow.',
    );

    setSaveStatus('unsaved');

    // IMPORTANT:
    // Do NOT persist failed saves as if they were saved.
  }
}, [
  resolvedVersionId,
  nodes,
  edges,
  persistWorkflowState,
]);
  /* ------------------------------------------------------------------------ */
  /* Run                                                                      */
  /* ------------------------------------------------------------------------ */

  /* ------------------------------------------------------------------------ */
  /* Validate                                                                 */
  /* ------------------------------------------------------------------------ */

  const handleValidate =
    useCallback((): ValidationResult[] => {
      const results: ValidationResult[] = [];

      const hasTrigger =
        nodes.some((node) => {
          const type =
            String(
              node.data?.type ??
              '',
            ).toUpperCase();

          return (
            type ===
              'MANUAL_TRIGGER' ||
            type ===
              'WEBHOOK' ||
            type ===
              'MANUAL' ||
            type ===
              'WEBHOOK_TRIGGER'
          );
        });

      results.push({
        id: 'trigger',
        label:
          'Trigger configured',
        status: hasTrigger
          ? ('success' as const)
          : ('error' as const),
        message:
          hasTrigger
            ? undefined
            : 'Add a Manual Input or Webhook trigger.',
      });

      const hasDisconnected =
        nodes.some((node) => {
          const connected =
            edges.some(
              (edge) =>
                edge.source ===
                  node.id ||
                edge.target ===
                  node.id,
            );

          return (
            nodes.length > 1 &&
            !connected
          );
        });

      results.push({
        id: 'connections',
        label:
          'All nodes connected',
        status:
          !hasDisconnected
            ? ('success' as const)
            : ('error' as const),
        message:
          hasDisconnected
            ? 'One or more nodes are disconnected.'
            : undefined,
      });

      const adjacency =
        new Map<string, string[]>();

      for (const node of nodes) {
        adjacency.set(node.id, []);
      }

      for (const edge of edges) {
        adjacency
          .get(edge.source)
          ?.push(edge.target);
      }

      const visiting = new Set<string>();
      const visited = new Set<string>();
      let hasCycle = false;

      const visit = (nodeId: string) => {
        if (hasCycle) return;
        if (visiting.has(nodeId)) {
          hasCycle = true;
          return;
        }
        if (visited.has(nodeId)) return;

        visiting.add(nodeId);

        for (const child of adjacency.get(nodeId) ?? []) {
          visit(child);
        }

        visiting.delete(nodeId);
        visited.add(nodeId);
      };

      for (const node of nodes) {
        visit(node.id);
      }

      results.push({
        id: 'cycles',
        label:
          'No cycles detected',
        status: !hasCycle
          ? ('success' as const)
          : ('error' as const),
        message:
          hasCycle
            ? 'Workflow contains a cycle.'
            : undefined,
      });

      setValidationResults(results);
      console.log(
        '[Relay] Validation:',
        results,
      );

      return results;
    }, [
      nodes,
      edges,
    ]);

  const handleValidateClick =
    useCallback(() => {
      handleValidate();
    }, [
      handleValidate,
    ]);

  const handleRun =
    useCallback(async () => {
      // Prevent duplicate Run submissions (the header button is also disabled
      // while running — this is the belt-and-suspenders guard).
      if (isRunning) {
        return;
      }

      const results =
        handleValidate();

      if (!results) {
        return;
      }

      // Resolve the Manual Input node's configured test payload into the
      // execution's root `input`, so `{{ input.* }}` expressions resolve at
      // run time. Mirrors how the webhook trigger passes the request body as
      // `input`.
      const hasManualTrigger = nodes.some((node) => {
        const type = String(node.data?.type ?? '').toUpperCase();
        return (
          type === 'MANUAL_TRIGGER' ||
          type === 'MANUAL' ||
          type === 'MANUAL_INPUT'
        );
      });

      const rawTestPayload = ((): string | undefined => {
        for (const node of nodes) {
          const type = String(node.data?.type ?? '').toUpperCase();
          if (
            type !== 'MANUAL_TRIGGER' &&
            type !== 'MANUAL' &&
            type !== 'MANUAL_INPUT'
          ) {
            continue;
          }
          const raw = node.data?.config?.testPayload;
          if (typeof raw === 'string' && raw.trim() !== '') {
            return raw;
          }
        }
        return undefined;
      })();

      let runInput: Record<string, unknown> = {};
      if (rawTestPayload !== undefined) {
        try {
          const parsed: unknown = JSON.parse(rawTestPayload);
          if (
            parsed !== null &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed)
          ) {
            runInput = parsed as Record<string, unknown>;
          }
        } catch {
          // Malformed JSON — leave runInput empty; surfaced as an error below.
        }
      }

      // A manual test run needs a usable Test Payload. Surface it in the
      // existing validation overlay instead of silently running with `{}`.
      const runResults = [...results];
      if (
        hasManualTrigger &&
        Object.keys(runInput).length === 0
      ) {
        runResults.push({
          id: 'manual-input-payload',
          label:
            'Add a valid Test Payload to the Manual Input node before running this workflow.',
          status: 'error',
        });
      }

      setValidationResults(runResults);

      if (
        runResults.some(
          (result) =>
            result.status ===
            'error',
        )
      ) {
        console.warn(
          '[Relay] Workflow run blocked: validation failed',
          runResults,
        );
        return;
      }

      const nodeDurations =
        Object.fromEntries(
          nodes.map((node, index) => [
            node.id,
            120 + index * 32,
          ]),
        );

      const executedNodeId =
        selectedNode?.id ??
        nodes[0]?.id ??
        null;

      setIsRunning(true);
      try {
        const execution = await runExecution({
          workflowId: workflowId ?? '',
          workflowVersionId: resolvedVersionId ?? undefined,
          triggerType: 'MANUAL',
          input: runInput,
        });

        setNodes((current) =>
          current.map((node) => ({
            ...node,
            data: {
              ...node.data,
              status: 'success',
              executed: true,
              executionDuration:
                nodeDurations[
                  node.id
                ] ?? 160,
            },
          })),
        );

        setEdges((current) =>
          current.map((edge) => ({
            ...edge,
            animated: true,
            style: {
              stroke: '#22c55e',
              strokeWidth: 2.25,
            },
            data: {
              ...(edge.data ?? {}),
              executed: true,
            },
          })),
        );

        setSelectedNode((current) =>
          current
            ? {
                ...current,
                data: {
                  ...(current.data ?? {}),
                  status: 'success',
                  executed: true,
                  executionDuration:
                    nodeDurations[
                      current.id
                    ] ?? 160,
                },
              }
            : current,
        );

        setExecutionSummary({
          status: 'success',
          label: 'LAST RUN • SUCCESS',
          executionId: execution?.id,
          nodeId: executedNodeId ?? undefined,
        });

        console.log(
          '[Relay] Workflow run:',
          {
            executionId: execution?.id,
            workflowId,
            versionId: resolvedVersionId,
            nodes,
            edges,
            results,
          },
        );
      } catch (error) {
        console.error(
          '[Relay] Workflow run failed:',
          error,
        );
      } finally {
        setIsRunning(false);
      }
    }, [
      handleValidate,
      workflowId,
      resolvedVersionId,
      nodes,
      edges,
      selectedNode,
      isRunning,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Publish                                                                  */
  /* ------------------------------------------------------------------------ */

  const publishWorkflowVersionMutation =
    usePublishWorkflowVersion();

  const handlePublish =
    useCallback(async () => {
      const results =
        handleValidate();

      setValidationResults(results);

      if (
        results.some(
          (result) =>
            result.status ===
            'error',
        )
      ) {
        console.warn(
          '[Relay] Workflow publish blocked: validation failed',
          results,
        );
        return;
      }

      if (!workflowId || !resolvedVersionId) {
        setSaveError(
          'Missing workflow or version information for publish.',
        );
        return;
      }

      setSaveStatus('saving');
      setSaveError(null);

      try {
        await publishWorkflowVersionMutation.mutateAsync({
          workflowId,
          versionId: resolvedVersionId,
        });

        setWorkflowVersion(
          (current) =>
            current.includes(
              '(draft)',
            )
              ? current.replace(
                  '(draft)',
                  '(published)',
                )
              : current.includes(
                    '(published)',
                  )
                ? current
                : `${current} (published)`,
        );

        persistWorkflowState(nodes, edges);
        setSaveStatus('saved');
        console.log(
          '[Relay] Workflow published:',
          {
            workflowId,
            versionId: resolvedVersionId,
            nodes,
            edges,
          },
        );
      } catch (error) {
        console.error(
          '[Relay] Workflow publish failed:',
          error,
        );

        setSaveError(
          'Publish failed. Please fix the workflow and try again.',
        );
        setSaveStatus('unsaved');
      }
    }, [
      handleValidate,
      workflowId,
      resolvedVersionId,
      nodes,
      edges,
      persistWorkflowState,
      publishWorkflowVersionMutation,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Variables                                                                */
  /* ------------------------------------------------------------------------ */

  const addVariable =
    useCallback(() => {
      const id =
        typeof crypto !==
          'undefined' &&
        typeof crypto.randomUUID ===
          'function'
          ? crypto.randomUUID()
          : `variable-${Date.now()}`;

      setVariables(
        (current) => [
          ...current,

          {
            id,
            key: 'NEW_VARIABLE',
            value: '',
          },
        ],
      );

      setSaveStatus('unsaved');
    }, []);

  const updateVariable =
    useCallback(
      (
        id: string,
        field:
          | 'key'
          | 'value',
        value: string,
      ) => {
        setVariables(
          (current) =>
            current.map(
              (variable) =>
                variable.id ===
                id
                  ? {
                      ...variable,
                      [field]:
                        value,
                    }
                  : variable,
            ),
        );

        setSaveStatus('unsaved');
      },
      [],
    );

  const deleteVariable =
    useCallback(
      (id: string) => {
        setVariables(
          (current) =>
            current.filter(
              (variable) =>
                variable.id !==
                id,
            ),
        );

        setSaveStatus('unsaved');
      },
      [],
    );

  /* ------------------------------------------------------------------------ */
  /* Workflow tags                                                            */
  /* ------------------------------------------------------------------------ */

  const removeTag =
    useCallback(
      (tag: string) => {
        setWorkflowTags(
          (current) =>
            current.filter(
              (item) =>
                item !== tag,
            ),
        );

        setSaveStatus('unsaved');
      },
      [],
    );

  const addTag =
    useCallback(() => {
      const tag = window.prompt(
        'Enter workflow tag',
      );

      if (!tag) {
        return;
      }

      const normalized =
        tag.trim().toLowerCase();

      if (!normalized) {
        return;
      }

      setWorkflowTags(
        (current) => {
          if (
            current.includes(
              normalized,
            )
          ) {
            return current;
          }

          return [
            ...current,
            normalized,
          ];
        },
      );

      setSaveStatus('unsaved');
    }, []);

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  /*
   * historyVersion intentionally participates
   * in render so header buttons update immediately.
   */
  void historyVersion;

  const canUndo =
    historyIndexRef.current > 0;

  const canRedo =
    historyIndexRef.current <
    historyRef.current.length - 1;

  const canDelete =
    selectedNode !== null;

  return (
    <WorkflowEditorLayout
      header={
        <WorkflowEditorHeader
          workflowName={
            workflowName
          }

          version={
            Number(
              (workflowVersion.match(/\d+/) ?? ['1'])[0],
            )
          }

          status={workflowStatus}

          saveStatus={
            saveStatus
          }

          canUndo={
            canUndo
          }

          canRedo={
            canRedo
          }

          canDelete={
            canDelete
          }

          onBack={() =>
            router.back()
          }

          onUndo={
            handleUndo
          }

          onRedo={
            handleRedo
          }

          onDuplicate={
            handleDuplicate
          }

          onDelete={
            handleDelete
          }

          onFitView={
            handleFitView
          }
          onGridToggle={
            handleToggleGrid
          }
          onZoomIn={
            handleZoomIn
          }
          onZoomOut={
            handleZoomOut
          }

          onSave={
            handleSave
          }

          onRun={
            handleRun
          }

          isRunning={isRunning}

          onValidate={
            handleValidateClick
          }

          onPublish={
            handlePublish
          }
        />
      }

      /* ================================================================== */
      /* LEFT SIDEBAR                                                       */
      /* ================================================================== */

      palette={
        <div className="flex h-full min-h-0 flex-col bg-white">
          {/* TABS */}

          <div className="grid shrink-0 grid-cols-3 border-b border-slate-200">
            <SidebarTabButton
              active={
                activeTab ===
                'nodes'
              }
              onClick={() =>
                setActiveTab(
                  'nodes',
                )
              }
            >
              Nodes
            </SidebarTabButton>

            <SidebarTabButton
              active={
                activeTab ===
                'variables'
              }
              onClick={() =>
                setActiveTab(
                  'variables',
                )
              }
            >
              Variables
            </SidebarTabButton>

            <SidebarTabButton
              active={
                activeTab ===
                'workflow'
              }
              onClick={() =>
                setActiveTab(
                  'workflow',
                )
              }
            >
              Workflow
            </SidebarTabButton>
          </div>

          {/* TAB CONTENT */}

          <div className="min-h-0 flex-1 overflow-hidden">
            {/* NODES */}

            {activeTab ===
              'nodes' && (
              <div className="h-full overflow-y-auto p-3">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Nodes
                </div>

                <input
                  type="text"
                  value={
                    nodeSearch
                  }
                  onChange={(
                    event,
                  ) =>
                    setNodeSearch(
                      event.target
                        .value,
                    )
                  }
                  placeholder="Search nodes..."
                  className="mb-4 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />

                <div className="space-y-5">
                  {filteredPaletteGroups.map(
                    (group) => (
                      <section
                        key={
                          group.title
                        }
                      >
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          {
                            group.title
                          }
                        </div>

                        <div className="space-y-1">
                          {group.nodes.map(
                            (
                              node,
                            ) => (
                              <NodePaletteItem
                                key={
                                  node.type
                                }
                                type={
                                  node.type
                                }
                                label={
                                  node.label
                                }
                                description={
                                  node.description
                                }
                              />
                            ),
                          )}
                        </div>
                      </section>
                    ),
                  )}
                </div>

                {filteredPaletteGroups.length ===
                  0 && (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No nodes found.
                  </div>
                )}

                <div className="mt-6 border-t border-slate-100 pt-3">
                  <p className="text-[10px] leading-4 text-slate-400">
                    Drag a node onto
                    the canvas to add
                    it.
                  </p>
                </div>
              </div>
            )}

            {/* VARIABLES */}

            {activeTab ===
              'variables' && (
              <VariablesPanel
                variables={
                  variables
                }
                onAdd={
                  addVariable
                }
                onUpdate={
                  updateVariable
                }
                onDelete={
                  deleteVariable
                }
              />
            )}

            {/* WORKFLOW */}

            {activeTab ===
              'workflow' && (
              <WorkflowSettingsPanel
                workflowName={
                  workflowName
                }
                workflowDescription={
                  workflowDescription
                }
                workflowOwner={
                  workflowOwner
                }
                workflowVersion={
                  workflowVersion
                }
                workflowTags={
                  workflowTags
                }
                workflowTimeout={
                  workflowTimeout
                }
                workflowRetries={
                  workflowRetries
                }
                workflowConcurrency={
                  workflowConcurrency
                }
                onNameChange={
                  (
                    value,
                  ) => {
                    setWorkflowName(
                      value,
                    );
                    setSaveStatus(
                      'unsaved',
                    );
                  }
                }
                onDescriptionChange={
                  (
                    value,
                  ) => {
                    setWorkflowDescription(
                      value,
                    );
                    setSaveStatus(
                      'unsaved',
                    );
                  }
                }
                onOwnerChange={
                  (
                    value,
                  ) => {
                    setWorkflowOwner(
                      value,
                    );
                    setSaveStatus(
                      'unsaved',
                    );
                  }
                }
                onVersionChange={
                  (
                    value,
                  ) => {
                    setWorkflowVersion(
                      value,
                    );
                    setSaveStatus(
                      'unsaved',
                    );
                  }
                }
                onTimeoutChange={
                  (
                    value,
                  ) => {
                    setWorkflowTimeout(
                      value,
                    );
                    setSaveStatus(
                      'unsaved',
                    );
                  }
                }
                onRetriesChange={
                  (
                    value,
                  ) => {
                    setWorkflowRetries(
                      value,
                    );
                    setSaveStatus(
                      'unsaved',
                    );
                  }
                }
                onConcurrencyChange={
                  (
                    value,
                  ) => {
                    setWorkflowConcurrency(
                      value,
                    );
                    setSaveStatus(
                      'unsaved',
                    );
                  }
                }
                onRemoveTag={
                  removeTag
                }
                onAddTag={
                  addTag
                }
              />
            )}
          </div>
        </div>
      }

      /* ================================================================== */
      /* CANVAS                                                             */
      /* ================================================================== */

      canvas={
        <WorkflowCanvas
          ref={canvasRef}
          nodes={
            nodes
          }

          edges={
            edges
          }

          validationResults={
            validationResults
          }

          executionSummary={
            executionSummary
          }

          onNodesChange={
            handleNodesChange
          }

          onEdgesChange={
            handleEdgesChange
          }
          onNodeSelect={
            handleNodeSelect
          }
          onGraphChange={
            handleGraphChange
          }
        />
      }

      /* ================================================================== */
      /* PROPERTIES                                                         */
      /* ================================================================== */

      properties={
        <div className="flex h-full flex-col">
          <div className="shrink-0 border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">
              Properties
            </div>

            <div className="mt-1 text-xs text-slate-500">
              Select a node to
              configure it.
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {selectedNode ? (
              <SelectedNodeProperties
                node={
                  selectedNode
                }
                onChange={handleNodeConfigChange}
              />
            ) : (
              <div className="text-xs text-slate-400">
                No node selected
              </div>
            )}
          </div>
        </div>
      }
    />
  );
}

/* ========================================================================== */
/* SIDEBAR TAB                                                               */
/* ========================================================================== */

type SidebarTabButtonProps = {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function SidebarTabButton({
  active,
  onClick,
  children,
}: SidebarTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        relative
        h-10
        text-[11px]
        font-medium
        transition
        ${
          active
            ? 'text-blue-600'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
        }
      `}
    >
      {children}

      {active && (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" />
      )}
    </button>
  );
}

/* ========================================================================== */
/* NODE PALETTE ITEM                                                         */
/* ========================================================================== */

type NodePaletteItemProps = {
  type: string;
  label: string;
  description: string;
};

function NodePaletteItem({
  type,
  label,
  description,
}: NodePaletteItemProps) {
  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    event.dataTransfer.setData(
      'application/relay-node',
      JSON.stringify({
        type,
        label,
        description,
      }),
    );

    event.dataTransfer.effectAllowed =
      'move';
  };

  return (
    <div
      draggable
      onDragStart={
        handleDragStart
      }
      className="
        group
        cursor-grab
        rounded-md
        border
        border-transparent
        px-2
        py-2
        transition
        hover:border-slate-200
        hover:bg-slate-50
        active:cursor-grabbing
        active:bg-slate-100
      "
    >
      <div className="text-xs font-medium text-slate-700 group-hover:text-slate-900">
        {label}
      </div>

      <div className="mt-0.5 text-[10px] leading-4 text-slate-400">
        {description}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* VARIABLES PANEL                                                           */
/* ========================================================================== */

type VariablesPanelProps = {
  variables: WorkflowVariable[];
  onAdd: () => void;
  onUpdate: (
    id: string,
    field:
      | 'key'
      | 'value',
    value: string,
  ) => void;
  onDelete: (id: string) => void;
};

function VariablesPanel({
  variables,
  onAdd,
  onUpdate,
  onDelete,
}: VariablesPanelProps) {
  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Workflow Variables
        </div>

        <button
          type="button"
          onClick={onAdd}
          className="text-[10px] font-medium text-blue-600 hover:text-blue-700"
        >
          + Add
        </button>
      </div>

      <div className="space-y-2">
        {variables.map(
          (variable) => (
            <div
              key={variable.id}
              className="rounded-md border border-slate-200 bg-white p-2"
            >
              <input
                value={
                  variable.key
                }
                onChange={(
                  event,
                ) =>
                  onUpdate(
                    variable.id,
                    'key',
                    event.target.value.toUpperCase(),
                  )
                }
                className="h-7 w-full border-0 bg-transparent px-1 text-[10px] font-semibold text-slate-700 outline-none focus:bg-slate-50"
              />

              <input
                value={
                  variable.value
                }
                onChange={(
                  event,
                ) =>
                  onUpdate(
                    variable.id,
                    'value',
                    event.target.value,
                  )
                }
                placeholder="Value"
                className="mt-1 h-7 w-full rounded border border-slate-200 bg-slate-50 px-2 text-[10px] text-slate-600 outline-none focus:border-blue-400 focus:bg-white"
              />

              <button
                type="button"
                onClick={() =>
                  onDelete(
                    variable.id,
                  )
                }
                className="mt-2 text-[9px] text-slate-400 hover:text-red-500"
              >
                Delete
              </button>
            </div>
          ),
        )}
      </div>

      <div className="mt-5 border-t border-slate-100 pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Variable Reference
        </div>

        <div className="mt-2 rounded-md bg-slate-50 p-2 font-mono text-[9px] leading-4 text-slate-500">
          {'{{ vars.KEY }}'}
        </div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Global Environment
          </div>

          <button
            type="button"
            onClick={() =>
              console.log(
                '[Relay] Add environment variable',
              )
            }
            className="text-[10px] font-medium text-blue-600 hover:text-blue-700"
          >
            + Add
          </button>
        </div>

        <EnvironmentVariable
          name="API_BASE_URL"
          value="https://api..."
        />

        <EnvironmentVariable
          name="OPENAI_API_KEY"
          value="••••••••••"
          secret
        />

        <EnvironmentVariable
          name="POSTGRES_URL"
          value="••••••••••"
          secret
        />

        <EnvironmentVariable
          name="REDIS_URL"
          value="redis://..."
        />

        <p className="mt-2 text-[9px] leading-4 text-slate-400">
          Shared across every
          workflow in this project.
          Secrets are write-only.
        </p>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* ENVIRONMENT VARIABLE                                                      */
/* ========================================================================== */

type EnvironmentVariableProps = {
  name: string;
  value: string;
  secret?: boolean;
};

function EnvironmentVariable({
  name,
  value,
  secret,
}: EnvironmentVariableProps) {
  return (
    <div className="border-b border-slate-100 py-2">
      <div className="text-[9px] font-medium text-slate-600">
        {name}
      </div>

      <div className="mt-0.5 truncate font-mono text-[9px] text-slate-400">
        {secret
          ? '••••••••••'
          : value}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* WORKFLOW SETTINGS PANEL                                                   */
/* ========================================================================== */

type WorkflowSettingsPanelProps = {
  workflowName: string;
  workflowDescription: string;
  workflowOwner: string;
  workflowVersion: string;
  workflowTags: string[];
  workflowTimeout: string;
  workflowRetries: string;
  workflowConcurrency: string;

  onNameChange: (
    value: string,
  ) => void;

  onDescriptionChange: (
    value: string,
  ) => void;

  onOwnerChange: (
    value: string,
  ) => void;

  onVersionChange: (
    value: string,
  ) => void;

  onTimeoutChange: (
    value: string,
  ) => void;

  onRetriesChange: (
    value: string,
  ) => void;

  onConcurrencyChange: (
    value: string,
  ) => void;

  onRemoveTag: (
    tag: string,
  ) => void;

  onAddTag: () => void;
};

function WorkflowSettingsPanel({
  workflowName,
  workflowDescription,
  workflowOwner,
  workflowVersion,
  workflowTags,
  workflowTimeout,
  workflowRetries,
  workflowConcurrency,
  onNameChange,
  onDescriptionChange,
  onOwnerChange,
  onVersionChange,
  onTimeoutChange,
  onRetriesChange,
  onConcurrencyChange,
  onRemoveTag,
  onAddTag,
}: WorkflowSettingsPanelProps) {
  return (
    <div className="h-full overflow-y-auto p-3">
      <FieldLabel>
        Workflow Name
      </FieldLabel>

      <input
        value={workflowName}
        onChange={(event) =>
          onNameChange(
            event.target.value,
          )
        }
        className="mb-4 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />

      <FieldLabel>
        Description
      </FieldLabel>

      <textarea
        value={
          workflowDescription
        }
        onChange={(event) =>
          onDescriptionChange(
            event.target.value,
          )
        }
        rows={4}
        className="mb-4 w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-2 text-xs leading-4 text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />

      <div className="mb-4 text-[9px] leading-4 text-slate-400">
        Shown in the workflow list
        and execution records.
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>
            Owner
          </FieldLabel>

          <input
            value={workflowOwner}
            onChange={(event) =>
              onOwnerChange(
                event.target.value,
              )
            }
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-700 outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <FieldLabel>
            Version
          </FieldLabel>

          <input
            value={
              workflowVersion
            }
            onChange={(event) =>
              onVersionChange(
                event.target.value,
              )
            }
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-700 outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <FieldLabel>
            Tags
          </FieldLabel>

          <button
            type="button"
            onClick={onAddTag}
            className="text-[10px] font-medium text-blue-600 hover:text-blue-700"
          >
            + tag
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {workflowTags.map(
            (tag) => (
              <button
                type="button"
                key={tag}
                onClick={() =>
                  onRemoveTag(
                    tag,
                  )
                }
                className="rounded-full bg-slate-100 px-2 py-1 text-[9px] text-slate-600 hover:bg-red-50 hover:text-red-500"
                title="Remove tag"
              >
                {tag}
                <span className="ml-1">
                  ×
                </span>
              </button>
            ),
          )}
        </div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Execution
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <FieldLabel>
              Timeout
            </FieldLabel>

            <input
              value={
                workflowTimeout
              }
              onChange={(event) =>
                onTimeoutChange(
                  event.target.value,
                )
              }
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-700 outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <FieldLabel>
              Retries
            </FieldLabel>

            <input
              value={
                workflowRetries
              }
              onChange={(event) =>
                onRetriesChange(
                  event.target.value,
                )
              }
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-700 outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <FieldLabel>
              Concurrency
            </FieldLabel>

            <input
              value={
                workflowConcurrency
              }
              onChange={(event) =>
                onConcurrencyChange(
                  event.target.value,
                )
              }
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-[10px] text-slate-700 outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* FIELD LABEL                                                               */
/* ========================================================================== */

function FieldLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </div>
  );
}

/* ========================================================================== */
/* SELECTED NODE PROPERTIES                                                  */
/* ========================================================================== */

function SelectedNodeProperties({
  node,
  onChange,
}: {
  node: Node<WorkflowCanvasNodeData>;
  onChange?: (
    nodeId: string,
    config: Record<string, unknown>,
    label?: string,
    description?: string,
  ) => void;
}) {
  return (
    <div className="w-full">
      <NodeConfigPanel node={node} onChange={onChange} />
    </div>
  );
}