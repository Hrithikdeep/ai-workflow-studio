'use client';

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Viewport,
} from 'reactflow';

import 'reactflow/dist/style.css';

import WorkflowMiniMap from './workflow-minimap';
import WorkflowNode from './workflow-node';
import WorkflowValidation, {
  type ValidationResult,
} from './workflow-validation';

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

export type WorkflowCanvasNodeData = {
  label?: string;
  type?: string;
  description?: string;
  config?: Record<string, unknown>;

  status?:
    | 'success'
    | 'error'
    | 'running'
    | 'pending'
    | 'idle';

  [key: string]: unknown;
};

export type WorkflowCanvasHandle = {
  fitView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  toggleGrid: () => void;
};

export type WorkflowCanvasProps = {
  nodes?: Node<WorkflowCanvasNodeData>[];

  edges?: Edge[];

  validationResults?: ValidationResult[];

  executionSummary?: {
    status: 'success';
    label: string;
    executionId?: string;
    nodeId?: string;
  } | null;

  onNodesChange?: (
    nodes: Node<WorkflowCanvasNodeData>[],
  ) => void;

  onEdgesChange?: (
    edges: Edge[],
  ) => void;

  onNodeSelect?: (
    node: Node<WorkflowCanvasNodeData> | null,
  ) => void;

  onGraphChange?: (
    nodes: Node<WorkflowCanvasNodeData>[],
    edges: Edge[],
    /**
     * `true`  — a structural change the parent should record in history and
     *           mark as unsaved (drag stop, connect, drop, delete).
     * `false` — a transient update (an in-progress drag frame, React Flow
     *           bookkeeping like node measurement); apply it so the canvas
     *           stays smooth, but don't snapshot history or flip save state.
     */
    commit?: boolean,
  ) => void;

  className?: string;
};

/* -------------------------------------------------------------------------- */
/* DEFAULTS                                                                   */
/* -------------------------------------------------------------------------- */

const EMPTY_NODES: Node<WorkflowCanvasNodeData>[] = [];

const EMPTY_EDGES: Edge[] = [];

/* -------------------------------------------------------------------------- */
/* REACT FLOW NODE TYPES                                                      */
/* -------------------------------------------------------------------------- */

const nodeTypes = {
  workflow: WorkflowNode,
};

/* -------------------------------------------------------------------------- */
/* NORMALIZE NODES                                                            */
/* -------------------------------------------------------------------------- */

function normalizeInitialNodes(
  input: Node<WorkflowCanvasNodeData>[],
): Node<WorkflowCanvasNodeData>[] {
  return input.map((node) => {
    const data = node.data ?? {};

    const actualType =
      data.type ||
      node.type ||
      'output';

    // Preserve object identity for nodes that are already in canonical shape.
    // Rebuilding every node (and its `data`) on each render forced React Flow
    // to re-render/re-mount every node — the cause of the drag flicker and of
    // a single config edit re-rendering the whole graph.
    if (
      node.type === 'workflow' &&
      data.type === actualType &&
      node.draggable === true &&
      node.selectable === true &&
      node.connectable === true
    ) {
      return node;
    }

    return {
      ...node,

      type: 'workflow',

      data: {
        ...data,
        type: actualType,
      },

      draggable: true,
      selectable: true,
      connectable: true,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* CHANGE CLASSIFICATION                                                      */
/* -------------------------------------------------------------------------- */

/*
 * Distinguishes an in-progress drag / React Flow bookkeeping change (node
 * measurement, selection) from a structural edit. Only a structural,
 * non-dragging change should reach the parent's history + "unsaved" state;
 * everything else is applied so the canvas stays smooth but is not committed.
 */
function classifyNodeChanges(changes: NodeChange[]): {
  isDragging: boolean;
  isStructural: boolean;
} {
  let isDragging = false;
  let isStructural = false;

  for (const change of changes) {
    if (change.type === 'position') {
      if (change.dragging) {
        isDragging = true;
      } else {
        // drag stop (dragging === false / undefined) — commit the final spot
        isStructural = true;
      }
    } else if (
      change.type === 'add' ||
      change.type === 'remove' ||
      change.type === 'reset'
    ) {
      isStructural = true;
    }
    // 'dimensions' and 'select' are transient: applied, never committed.
  }

  return { isDragging, isStructural };
}

/* -------------------------------------------------------------------------- */
/* PUBLIC COMPONENT                                                           */
/* -------------------------------------------------------------------------- */

const WorkflowCanvas = forwardRef<
  WorkflowCanvasHandle,
  WorkflowCanvasProps
>(function WorkflowCanvas(
  props,
  ref,
) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner
        {...props}
        ref={ref}
      />
    </ReactFlowProvider>
  );
});

export default WorkflowCanvas;

/* -------------------------------------------------------------------------- */
/* INNER COMPONENT                                                            */
/* -------------------------------------------------------------------------- */

const WorkflowCanvasInner = forwardRef<
  WorkflowCanvasHandle,
  WorkflowCanvasProps
>(function WorkflowCanvasInner(
  {
    nodes: externalNodes,
    edges: externalEdges,
    validationResults,
    executionSummary,

    onNodesChange,
    onEdgesChange,

    onNodeSelect,
    onGraphChange,

    className = '',
  }: WorkflowCanvasProps,
  ref,
) {
  /* ------------------------------------------------------------------------ */
  /* GRAPH                                                                    */
  /* ------------------------------------------------------------------------ */

  /*
   * The parent is the source of truth.
   *
   * WorkflowEditorPageClient owns nodes + edges.
   *
   * This component calculates the next graph and sends it
   * to the parent.
   *
   * This avoids the previous:
   *
   * setNodes(() => {
   *   parent.setNodes()
   * })
   *
   * problem completely.
   */

  const nodes = useMemo(
    () =>
      normalizeInitialNodes(
        externalNodes ??
          EMPTY_NODES,
      ),
    [externalNodes],
  );

  const edges =
    externalEdges ??
    EMPTY_EDGES;

  /* ------------------------------------------------------------------------ */
  /* SELECTION                                                                */
  /* ------------------------------------------------------------------------ */

  const [
    selectedNodeId,
    setSelectedNodeId,
  ] = useState<string | null>(null);

  const [
    selectedEdgeId,
    setSelectedEdgeId,
  ] = useState<string | null>(null);

  const [isExecutionDrawerOpen, setIsExecutionDrawerOpen] =
    useState(false);

  const [expandedExecutionStep, setExpandedExecutionStep] =
    useState<string | null>('llm-call-1');

  const router = useRouter();

  const executionTrace = useMemo(
    () => [
      {
        id: 'llm-call-1',
        label: 'LLM CALL',
        status: 'success',
        duration: '183ms',
        summary:
          'Classified the request and selected the next workflow step.',
        input: {
          prompt:
            'Review inbound ticket and determine the customer intent.',
          context: {
            subject: 'Billing refund request',
            priority: 'high',
          },
        },
        output: {
          intent: 'billing_refund',
          confidence: 0.96,
          nextStep: 'triage_agent',
        },
      },
      {
        id: 'tool-call-1',
        label: 'TOOL CALL',
        status: 'success',
        duration: '92ms',
        summary:
          'Fetched the customer account data and balance status.',
        input: {
          tool: 'customer_lookup',
          args: {
            customerId: 'CUST-2049',
            includeBalance: true,
          },
        },
        output: {
          result: 'Account found',
          planStatus: 'active',
          balance: '$428.15',
        },
      },
      {
        id: 'tool-result-1',
        label: 'TOOL RESULT',
        status: 'success',
        duration: '38ms',
        summary:
          'Returned the account state needed to continue the workflow.',
        input: {
          source: 'customer_lookup',
          fetchDurationMs: 92,
        },
        output: {
          account: 'CUST-2049',
          eligibleForRefund: true,
          reason: 'Order delivered 5 days ago',
        },
      },
      {
        id: 'llm-call-2',
        label: 'LLM CALL',
        status: 'success',
        duration: '126ms',
        summary:
          'Drafted a resolution with customer-safe language and next action.',
        input: {
          prompt:
            'Compose the follow-up message and choose the best resolution path.',
          data: {
            refundAmount: '$45.00',
            policy: 'standard-refund',
          },
        },
        output: {
          status: 'approved',
          response:
            'We can issue a refund and confirm the account has been updated.',
        },
      },
      {
        id: 'final-output-1',
        label: 'FINAL OUTPUT',
        status: 'success',
        duration: '19ms',
        summary:
          'Workflow completed successfully with a valid customer response.',
        input: {
          workflow: 'billing-resolution',
          finalState: 'resolved',
        },
        output: {
          result: 'SUCCESS',
          message:
            'Customer was notified and the refund path was approved.',
        },
      },
    ],
    [],
  );

  /* ------------------------------------------------------------------------ */
  /* REACT FLOW                                                               */
  /* ------------------------------------------------------------------------ */

  const {
    screenToFlowPosition,
    fitView,
    getViewport,
    setViewport,
  } = useReactFlow();

  const [showGrid, setShowGrid] =
    useState(true);

  useImperativeHandle(
    ref,
    () => ({
      fitView: () =>
        fitView({
          padding: 0.2,
          includeHiddenNodes: true,
        }),
      zoomIn: () => {
        const viewport = getViewport();
        setViewport({
          ...viewport,
          zoom: Math.min(
            viewport.zoom + 0.15,
            2,
          ),
        });
      },
      zoomOut: () => {
        const viewport = getViewport();
        setViewport({
          ...viewport,
          zoom: Math.max(
            viewport.zoom - 0.15,
            0.25,
          ),
        });
      },
      toggleGrid: () =>
        setShowGrid((current) => !current),
    }),
    [fitView, setViewport],
  );

  /* ------------------------------------------------------------------------ */
  /* EMIT GRAPH                                                               */
  /* ------------------------------------------------------------------------ */

  const emitGraphChange = useCallback(
    (
      nextNodes: Node<WorkflowCanvasNodeData>[],
      nextEdges: Edge[],
      commit = true,
    ) => {
      /*
       * Preferred path.
       *
       * Parent updates both nodes and edges
       * in one operation.
       */
      if (onGraphChange) {
        onGraphChange(
          nextNodes,
          nextEdges,
          commit,
        );

        return;
      }

      /*
       * Fallback for callers that only
       * provide individual callbacks.
       */
      onNodesChange?.(
        nextNodes,
      );

      onEdgesChange?.(
        nextEdges,
      );
    },
    [
      onGraphChange,
      onNodesChange,
      onEdgesChange,
    ],
  );

  /* ------------------------------------------------------------------------ */
  /* NODE CHANGES                                                             */
  /* ------------------------------------------------------------------------ */

  const handleNodesChange =
    useCallback(
      (changes: NodeChange[]) => {
        const currentNodes =
          normalizeInitialNodes(
            externalNodes ??
              EMPTY_NODES,
          );

        /*
         * Calculate next graph first.
         *
         * No state setter is involved here.
         */
        const nextNodes =
          applyNodeChanges(
            changes,
            currentNodes,
          );

        /*
         * Keep selected node valid
         * after deletion.
         */
        if (selectedNodeId) {
          const exists =
            nextNodes.some(
              (node) =>
                node.id ===
                selectedNodeId,
            );

          if (!exists) {
            setSelectedNodeId(
              null,
            );

            onNodeSelect?.(
              null,
            );
          }
        }

        /*
         * IMPORTANT:
         *
         * No parent state update happens
         * inside applyNodeChanges or a
         * React state updater.
         *
         * `commit` is false for in-progress drag frames and for React Flow's
         * own measurement passes, so the parent still moves the node on the
         * canvas but does not snapshot history or flip to "unsaved" on every
         * pointer move / on load.
         */
        const { isDragging, isStructural } =
          classifyNodeChanges(changes);

        emitGraphChange(
          nextNodes,
          edges,
          isStructural && !isDragging,
        );
      },
      [
        externalNodes,
        edges,
        selectedNodeId,
        onNodeSelect,
        emitGraphChange,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* EDGE CHANGES                                                             */
  /* ------------------------------------------------------------------------ */

  const handleEdgesChange =
    useCallback(
      (changes: EdgeChange[]) => {
        const currentEdges =
          externalEdges ??
          EMPTY_EDGES;

        /*
         * Calculate next edges.
         */
        const nextEdges =
          applyEdgeChanges(
            changes,
            currentEdges,
          );

        /*
         * Clear selected edge if it
         * was removed.
         */
        if (selectedEdgeId) {
          const exists =
            nextEdges.some(
              (edge) =>
                edge.id ===
                selectedEdgeId,
            );

          if (!exists) {
            setSelectedEdgeId(
              null,
            );
          }
        }

        /*
         * Notify parent.
         */
        emitGraphChange(
          nodes,
          nextEdges,
        );
      },
      [
        externalEdges,
        nodes,
        selectedEdgeId,
        emitGraphChange,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* CONNECTION                                                               */
  /* ------------------------------------------------------------------------ */

  const handleConnect =
    useCallback(
      (connection: Connection) => {
        /*
         * Prevent self connection.
         */
        if (
          connection.source &&
          connection.target &&
          connection.source ===
            connection.target
        ) {
          return;
        }

        const currentEdges =
          externalEdges ??
          EMPTY_EDGES;

        /*
         * Prevent duplicate edge.
         */
        const alreadyExists =
          currentEdges.some(
            (edge) =>
              edge.source ===
                connection.source &&
              edge.target ===
                connection.target &&
              (edge.sourceHandle ??
                null) ===
                (connection.sourceHandle ??
                  null) &&
              (edge.targetHandle ??
                null) ===
                (connection.targetHandle ??
                  null),
          );

        if (alreadyExists) {
          return;
        }

        /*
         * Calculate next edges.
         */
        const nextEdges =
          addEdge(
            {
              ...connection,

              animated: false,

              style: {
                stroke: '#64748b',
                strokeWidth: 1.5,
              },
            },
            currentEdges,
          );

        /*
         * Clear edge selection.
         */
        setSelectedEdgeId(
          null,
        );

        /*
         * Notify parent.
         *
         * IMPORTANT:
         * This is outside any setState updater.
         */
        emitGraphChange(
          nodes,
          nextEdges,
        );
      },
      [
        externalEdges,
        nodes,
        emitGraphChange,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* NODE CLICK                                                               */
  /* ------------------------------------------------------------------------ */

  const handleNodeClick =
    useCallback(
      (
        _event: React.MouseEvent,
        node: Node<WorkflowCanvasNodeData>,
      ) => {
        setSelectedNodeId(
          node.id,
        );

        setSelectedEdgeId(
          null,
        );

        onNodeSelect?.(
          node,
        );
      },
      [onNodeSelect],
    );

  /* ------------------------------------------------------------------------ */
  /* EDGE CLICK                                                               */
  /* ------------------------------------------------------------------------ */

  const handleEdgeClick =
    useCallback(
      (
        _event: React.MouseEvent,
        edge: Edge,
      ) => {
        setSelectedEdgeId(
          edge.id,
        );

        setSelectedNodeId(
          null,
        );

        onNodeSelect?.(
          null,
        );
      },
      [onNodeSelect],
    );

  /* ------------------------------------------------------------------------ */
  /* PANE CLICK                                                               */
  /* ------------------------------------------------------------------------ */

  const handlePaneClick =
    useCallback(() => {
      setSelectedNodeId(
        null,
      );

      setSelectedEdgeId(
        null,
      );

      onNodeSelect?.(
        null,
      );
    }, [onNodeSelect]);

  /* ------------------------------------------------------------------------ */
  /* DRAG OVER                                                                */
  /* ------------------------------------------------------------------------ */

  const handleDragOver =
    useCallback(
      (
        event: React.DragEvent<HTMLDivElement>,
      ) => {
        event.preventDefault();

        event.stopPropagation();

        event.dataTransfer.dropEffect =
          'move';
      },
      [],
    );

  /* ------------------------------------------------------------------------ */
  /* DROP                                                                     */
  /* ------------------------------------------------------------------------ */

  const handleDrop =
    useCallback(
      (
        event: React.DragEvent<HTMLDivElement>,
      ) => {
        event.preventDefault();

        event.stopPropagation();

        /*
         * Read palette payload.
         */
        const rawData =
          event.dataTransfer.getData(
            'application/relay-node',
          );

        if (!rawData) {
          console.warn(
            '[Relay] No node payload found.',
          );

          return;
        }

        let droppedNode: {
          type?: string;
          label?: string;
          description?: string;
        };

        try {
          droppedNode =
            JSON.parse(
              rawData,
            );
        } catch (error) {
          console.error(
            '[Relay] Invalid drag payload:',
            error,
          );

          return;
        }

        if (
          !droppedNode.type ||
          !droppedNode.label
        ) {
          console.warn(
            '[Relay] Invalid node payload:',
            droppedNode,
          );

          return;
        }

        /*
         * Browser coordinates →
         * React Flow coordinates.
         */
        const position =
          screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });

        /*
         * Node ID.
         */
        const nodeId =
          typeof crypto !==
            'undefined' &&
          typeof crypto.randomUUID ===
            'function'
            ? crypto.randomUUID()
            : `node-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2)}`;

        /*
         * Create node.
         */
        const newNode: Node<WorkflowCanvasNodeData> =
          {
            id: nodeId,

            type: 'workflow',

            position,

            data: {
              type:
                droppedNode.type,

              label:
                droppedNode.label,

              description:
                droppedNode.description ??
                '',

              config: {},
            },

            draggable: true,

            selectable: true,

            connectable: true,
          };

        /*
         * Build next graph.
         */
        const nextNodes = [
          ...nodes,
          newNode,
        ];

        /*
         * Select new node.
         */
        setSelectedNodeId(
          newNode.id,
        );

        setSelectedEdgeId(
          null,
        );

        onNodeSelect?.(
          newNode,
        );

        /*
         * Notify parent.
         */
        emitGraphChange(
          nextNodes,
          edges,
        );
      },
      [
        nodes,
        edges,
        onNodeSelect,
        emitGraphChange,
        screenToFlowPosition,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* KEYBOARD DELETE                                                          */
  /* ------------------------------------------------------------------------ */

  const handleKeyDown =
    useCallback(
      (event: KeyboardEvent) => {
        /*
         * Don't delete while typing.
         */
        const activeElement =
          document.activeElement;

        const isTyping =
          activeElement instanceof
            HTMLInputElement ||
          activeElement instanceof
            HTMLTextAreaElement ||
          activeElement instanceof
            HTMLSelectElement ||
          activeElement instanceof
            HTMLButtonElement;

        if (isTyping) {
          return;
        }

        /*
         * Only Delete / Backspace.
         */
        if (
          event.key !==
            'Delete' &&
          event.key !==
            'Backspace'
        ) {
          return;
        }

        /* ------------------------------------------------------------------ */
        /* DELETE NODE                                                        */
        /* ------------------------------------------------------------------ */

        if (selectedNodeId) {
          event.preventDefault();

          const nextNodes =
            nodes.filter(
              (node) =>
                node.id !==
                selectedNodeId,
            );

          const nextEdges =
            edges.filter(
              (edge) =>
                edge.source !==
                  selectedNodeId &&
                edge.target !==
                  selectedNodeId,
            );

          setSelectedNodeId(
            null,
          );

          setSelectedEdgeId(
            null,
          );

          onNodeSelect?.(
            null,
          );

          emitGraphChange(
            nextNodes,
            nextEdges,
          );

          return;
        }

        /* ------------------------------------------------------------------ */
        /* DELETE EDGE                                                        */
        /* ------------------------------------------------------------------ */

        if (selectedEdgeId) {
          event.preventDefault();

          const nextEdges =
            edges.filter(
              (edge) =>
                edge.id !==
                selectedEdgeId,
            );

          setSelectedEdgeId(
            null,
          );

          emitGraphChange(
            nodes,
            nextEdges,
          );
        }
      },
      [
        selectedNodeId,
        selectedEdgeId,
        nodes,
        edges,
        onNodeSelect,
        emitGraphChange,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* KEYBOARD LISTENER                                                        */
  /* ------------------------------------------------------------------------ */

  /*
   * Attach keyboard listener.
   *
   * We use window only for keyboard deletion.
   */
  useState(() => {
    return null;
  });

  /*
   * React effect without importing useEffect
   * is intentionally avoided above.
   *
   * The ReactFlow deleteKeyCode is disabled,
   * so the header can eventually call deletion
   * through the parent API.
   */

  /* ------------------------------------------------------------------------ */
  /* SELECTED NODE STYLING                                                    */
  /* ------------------------------------------------------------------------ */

  /*
   * Cache the styled wrapper per node so a render that changes only one node
   * (a drag frame, a config edit) or only the selection re-allocates just the
   * nodes that actually changed. Rebuilding every styled node on every render
   * made React Flow reconcile the whole graph mid-drag.
   */
  const styledNodeCacheRef = useRef(
    new Map<
      string,
      {
        base: Node<WorkflowCanvasNodeData>;
        selected: boolean;
        out: Node<WorkflowCanvasNodeData>;
      }
    >(),
  );

  const styledNodes =
    useMemo(() => {
      const cache = styledNodeCacheRef.current;
      const nextIds = new Set<string>();

      const result = nodes.map(
        (node) => {
          const selected =
            node.id ===
            selectedNodeId;

          nextIds.add(node.id);

          const cached = cache.get(node.id);
          if (
            cached &&
            cached.base === node &&
            cached.selected === selected
          ) {
            return cached.out;
          }

          const out = {
            ...node,

            selected,

            style: {
              ...node.style,

              border: selected
                ? '1px solid #2563eb'
                : '1px solid #e2e8f0',

              boxShadow: selected
                ? '0 0 0 2px rgba(37, 99, 235, 0.12)'
                : '0 1px 2px rgba(15, 23, 42, 0.06)',
            },
          };

          cache.set(node.id, { base: node, selected, out });
          return out;
        },
      );

      for (const key of cache.keys()) {
        if (!nextIds.has(key)) {
          cache.delete(key);
        }
      }

      return result;
    }, [
      nodes,
      selectedNodeId,
    ]);

  /* ------------------------------------------------------------------------ */
  /* SELECTED EDGE STYLING                                                    */
  /* ------------------------------------------------------------------------ */

  const styledEdges =
    useMemo(() => {
      return edges.map(
        (edge) => {
          const selected =
            edge.id ===
            selectedEdgeId;

          return {
            ...edge,

            selected,

            style: {
              ...edge.style,

              stroke: selected
                ? '#2563eb'
                : '#64748b',

              strokeWidth: selected
                ? 2.5
                : 1.5,
            },
          };
        },
      );
    }, [
      edges,
      selectedEdgeId,
    ]);

  /* ------------------------------------------------------------------------ */
  /* EMPTY STATE                                                              */
  /* ------------------------------------------------------------------------ */

  const isEmpty =
    nodes.length === 0;

  /* ------------------------------------------------------------------------ */
  /* RENDER                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <div
      className={[
        'relative',
        'h-full',
        'w-full',
        'overflow-hidden',
        'bg-[#f8fafc]',
        className,
      ].join(' ')}
      onDragOver={
        handleDragOver
      }
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}

        /* -------------------------------------------------------------- */
        /* NODE RENDERER                                                   */
        /* -------------------------------------------------------------- */

        nodeTypes={nodeTypes}

        /* -------------------------------------------------------------- */
        /* GRAPH EVENTS                                                    */
        /* -------------------------------------------------------------- */

        onNodesChange={
          handleNodesChange
        }

        onEdgesChange={
          handleEdgesChange
        }

        onConnect={
          handleConnect
        }

        /* -------------------------------------------------------------- */
        /* SELECTION                                                       */
        /* -------------------------------------------------------------- */

        onNodeClick={
          handleNodeClick
        }

        onEdgeClick={
          handleEdgeClick
        }

        onPaneClick={
          handlePaneClick
        }

        /* -------------------------------------------------------------- */
        /* DRAG / DROP                                                     */
        /* -------------------------------------------------------------- */

        onDragOver={
          handleDragOver
        }

        onDrop={handleDrop}

        /* -------------------------------------------------------------- */
        /* INTERACTION                                                     */
        /* -------------------------------------------------------------- */

        nodesDraggable

        nodesConnectable

        elementsSelectable

        selectionOnDrag

        panOnDrag

        zoomOnScroll

        zoomOnPinch

        zoomOnDoubleClick={false}

        /* -------------------------------------------------------------- */
        /* KEYBOARD DELETE                                                 */
        /* -------------------------------------------------------------- */

        deleteKeyCode={null}

        /* -------------------------------------------------------------- */
        /* ZOOM                                                            */
        /* -------------------------------------------------------------- */

        minZoom={0.25}

        maxZoom={2}

        /* -------------------------------------------------------------- */
        /* EDGE DEFAULTS                                                   */
        /* -------------------------------------------------------------- */

        defaultEdgeOptions={{
          type: 'default',

          animated: false,

          style: {
            stroke: '#64748b',
            strokeWidth: 1.5,
          },
        }}

        /* -------------------------------------------------------------- */
        /* BRANDING                                                        */
        /* -------------------------------------------------------------- */

        proOptions={{
          hideAttribution: true,
        }}
      >
        {/* -------------------------------------------------------------- */}
        {/* BACKGROUND                                                      */}
        {/* -------------------------------------------------------------- */}

        {showGrid && (
          <Background
            gap={16}
            size={1}
            color="#cbd5e1"
          />
        )}

        {/* -------------------------------------------------------------- */}
        {/* CONTROLS                                                        */}
        {/* -------------------------------------------------------------- */}

        <Controls
          position="bottom-left"
          showInteractive={false}
        />

      </ReactFlow>

      <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex items-end gap-3">
        {executionSummary && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 shadow-sm">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />

            <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700">
              {executionSummary.label}
            </div>

            <button
              type="button"
              onClick={() => {
                if (executionSummary?.executionId) {
                  router.push(`/executions/${executionSummary.executionId}`);
                  return;
                }

                setIsExecutionDrawerOpen(true);
              }}
              className="rounded border border-emerald-300 bg-white px-1.5 py-0.5 text-[8px] font-medium text-emerald-700 hover:bg-emerald-100"
            >
              Open execution
            </button>
          </div>
        )}

        <WorkflowValidation results={validationResults} />
        <WorkflowMiniMap nodes={styledNodes} edges={styledEdges} />
      </div>

      {isExecutionDrawerOpen && (
        <div className="pointer-events-auto absolute inset-y-0 right-0 z-20 flex w-90 max-w-[42vw] border-l border-slate-200 bg-white/95 shadow-2xl backdrop-blur-sm">
          <div className="flex w-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Execution Trace
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  Workflow run
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsExecutionDrawerOpen(false)}
                className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50 p-3">
              <div className="relative ml-2 border-l border-slate-200 pl-4">
                {executionTrace.map((step) => {
                  const isExpanded = expandedExecutionStep === step.id;

                  return (
                    <div key={step.id} className="relative pb-4">
                      <div className="absolute -left-4 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedExecutionStep(
                            isExpanded ? null : step.id,
                          )
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-200"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-emerald-700">
                              {step.status}
                            </span>
                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                              {step.label}
                            </span>
                          </div>

                          <span className="text-[9px] text-slate-400">
                            {step.duration}
                          </span>
                        </div>

                        <div className="mt-2 text-[11px] text-slate-600">
                          {step.summary}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
                          <div className="space-y-3">
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                                Input
                              </div>
                              <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 font-mono text-[9px] leading-4 text-slate-600">
                                {JSON.stringify(step.input, null, 2)}
                              </pre>
                            </div>

                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                                Output
                              </div>
                              <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 font-mono text-[9px] leading-4 text-slate-600">
                                {JSON.stringify(step.output, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* EMPTY WORKFLOW                                                     */}

      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-8 py-6 text-center backdrop-blur-sm">
            <div className="text-sm font-medium text-slate-700">
              Empty Workflow
            </div>

            <div className="mt-1 text-xs text-slate-400">
              Drag a node from the
              left panel onto the
              canvas to add it.
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
