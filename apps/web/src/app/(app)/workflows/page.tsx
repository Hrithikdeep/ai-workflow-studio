'use client';

import NewWorkflowForm from '@/components/workflows/new-workflow-form';
import {
  useCreateWorkflow,
  useDeleteWorkflow,
  useWorkflows,
} from '@/hooks/use-workflows';
import {
  getWorkflowGraph,
  getWorkflowVersions,
  updateWorkflowGraph,
} from '@/lib/api/workflows';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Workflow = {
  id: string;
  name: string;
  description?: string | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

type WorkflowVersion = {
  id: string;
  version?: number;
  isPublished?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

const getLatestVersion = (
  versions: WorkflowVersion[] = [],
): WorkflowVersion | undefined => {
  return [...versions].sort(
    (a, b) => (b.version ?? 0) - (a.version ?? 0),
  )[0];
};

export default function WorkflowsPage() {
  const router = useRouter();

  const {
    data: workflows = [],
    isLoading: loading,
    isError,
    refetch,
  } = useWorkflows();

  const createWorkflowMutation = useCreateWorkflow();
  const deleteWorkflowMutation = useDeleteWorkflow();

  const [isNewWorkflowOpen, setIsNewWorkflowOpen] =
    useState(false);

  const [search, setSearch] = useState('');

  const [filter, setFilter] = useState<
    'ALL' | 'ACTIVE' | 'DRAFT'
  >('ALL');

  useEffect(() => {
    const query = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('q') ?? '' : '';
    setSearch(query);
  }, []);

  /*
   * Open an existing workflow.
   */
  const openWorkflowById = async (workflowId: string) => {
    try {
      const versions = await getWorkflowVersions(workflowId);
      const latestVersion = getLatestVersion(versions);

      if (!latestVersion) {
        alert('This workflow does not have a version yet.');
        return;
      }

      router.push(`/workflows/${workflowId}`);
    } catch (error) {
      console.error(
        '[Relay] Failed to open workflow:',
        error,
      );

      alert('This workflow could not be opened.');
    }
  };

  /*
   * Create workflow.
   */
  const handleCreateWorkflow = async ({
    name,
    description,
    startFrom,
    sourceWorkflowId,
  }: {
    name: string;
    description: string;
    startFrom: 'blank' | 'duplicate';
    sourceWorkflowId?: string;
  }) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    try {
      const createdWorkflow =
        await createWorkflowMutation.mutateAsync({
          name: trimmedName,
          description:
            description.trim() || undefined,
        });

      const versions = await getWorkflowVersions(
        createdWorkflow.id,
      );

      const latestVersion = getLatestVersion(versions);

      /*
       * Duplicate source workflow graph when requested.
       */
      if (
        startFrom === 'duplicate' &&
        sourceWorkflowId &&
        latestVersion
      ) {
        try {
          const sourceVersions =
            await getWorkflowVersions(
              sourceWorkflowId,
            );

          const sourceLatestVersion =
            getLatestVersion(sourceVersions);

          if (sourceLatestVersion) {
            const sourceGraph =
              await getWorkflowGraph(
                sourceLatestVersion.id,
              );

            if (
              sourceGraph.nodes?.length ||
              sourceGraph.edges?.length
            ) {
              await updateWorkflowGraph(
                latestVersion.id,
                {
                  nodes: (
                    sourceGraph.nodes ?? []
                  ).map((node) => ({
                    id: node.id,
                    type:
                      node.type ??
                      'MANUAL_TRIGGER',
                    label:
                      node.label ??
                      node.type ??
                      'Node',
                    position: {
                      x: node.positionX ?? 0,
                      y: node.positionY ?? 0,
                    },
                    data: {
                      label:
                        node.label ??
                        node.type ??
                        'Node',
                      type:
                        node.type ??
                        'MANUAL_TRIGGER',
                      config:
                        node.config ?? {},
                    },
                  })),

                  edges: (
                    sourceGraph.edges ?? []
                  ).map((edge) => ({
                    id: edge.id,
                    source: edge.sourceNodeId,
                    target: edge.targetNodeId,
                    sourceHandle:
                      edge.sourceHandle ??
                      undefined,
                    targetHandle:
                      edge.targetHandle ??
                      undefined,
                  })),
                },
              );
            }
          }
        } catch (duplicationError) {
          console.error(
            '[Relay] Failed to duplicate workflow graph:',
            duplicationError,
          );
        }
      }

      setIsNewWorkflowOpen(false);

      router.push(
        `/workflows/${createdWorkflow.id}`,
      );
    } catch (error) {
      console.error(
        '[Relay] Failed to create workflow:',
        error,
      );

      alert('Unable to create workflow.');
    }
  };

  /*
   * Delete workflow.
   */
  const handleDeleteWorkflow = async (
    workflowId: string,
  ) => {
    try {
      await deleteWorkflowMutation.mutateAsync(
        workflowId,
      );

      await refetch();
    } catch (error) {
      console.error(
        '[Relay] Failed to delete workflow:',
        error,
      );

      alert('Unable to delete workflow.');
    }
  };

  /*
   * Search + status filtering.
   *
   * IMPORTANT:
   * This is calculated only once and reused by the UI.
   */
  const query = search.trim().toLowerCase();

  const filteredWorkflows = workflows.filter(
    (workflow: Workflow) => {
      /*
       * Status filter.
       */
      if (filter === 'ACTIVE') {
        const isActive =
          workflow.status === 'PUBLISHED' ||
          workflow.status === 'ACTIVE';

        if (!isActive) {
          return false;
        }
      }

      if (filter === 'DRAFT') {
        const isActive =
          workflow.status === 'PUBLISHED' ||
          workflow.status === 'ACTIVE';

        if (isActive) {
          return false;
        }
      }

      /*
       * Search filter.
       */
      if (!query) {
        return true;
      }

      const searchableText =
        `${workflow.name ?? ''} ${
          workflow.description ?? ''
        }`.toLowerCase();

      return searchableText.includes(query);
    },
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="flex h-20 items-center justify-between px-8">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Acme Engineering</span>

              <span>/</span>

              <span className="font-medium text-slate-600">
                Workflows
              </span>
            </div>

            <h1 className="mt-3 text-2xl font-semibold tracking-tight">
              Workflows
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Build and manage your automation workflows.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setIsNewWorkflowOpen(true)
            }
            className="rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >
            + New Workflow
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="px-8 py-6">
        {/* Search + Filters */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search workflows..."
              className="h-10 w-72 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />

            <div className="flex h-10 items-center rounded-md border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() =>
                  setFilter('ALL')
                }
                className={`rounded px-3 py-1.5 text-xs font-medium ${
                  filter === 'ALL'
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                All
              </button>

              <button
                type="button"
                onClick={() =>
                  setFilter('ACTIVE')
                }
                className={`rounded px-3 py-1.5 text-xs font-medium ${
                  filter === 'ACTIVE'
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                Active
              </button>

              <button
                type="button"
                onClick={() =>
                  setFilter('DRAFT')
                }
                className={`rounded px-3 py-1.5 text-xs font-medium ${
                  filter === 'DRAFT'
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                Draft
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-400">
            {filteredWorkflows.length}{' '}
            {filteredWorkflows.length === 1
              ? 'workflow'
              : 'workflows'}
          </div>
        </div>

        {/* Error */}
        {isError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            Unable to load workflows.
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
            Loading workflows...
          </div>
        )}

        {/* Empty */}
        {!loading &&
          !isError &&
          filteredWorkflows.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
              <div className="text-sm font-medium text-slate-700">
                {workflows.length === 0
                  ? 'No workflows yet'
                  : 'No workflows found'}
              </div>

              <p className="mt-1 text-xs text-slate-400">
                {workflows.length === 0
                  ? 'Create your first workflow to get started.'
                  : 'Try changing your search or filter.'}
              </p>
            </div>
          )}

        {/* Workflow List */}
        {!loading &&
          !isError &&
          filteredWorkflows.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              {filteredWorkflows.map(
                (workflow: Workflow) => (
                  <WorkflowRow
                    key={workflow.id}
                    workflow={workflow}
                    onOpen={openWorkflowById}
                    onDelete={
                      handleDeleteWorkflow
                    }
                  />
                ),
              )}
            </div>
          )}
      </main>

      {/* New Workflow */}
      <NewWorkflowForm
        open={isNewWorkflowOpen}
        onClose={() =>
          setIsNewWorkflowOpen(false)
        }
        workflows={workflows}
        onCreate={handleCreateWorkflow}
      />
    </div>
  );
}

function WorkflowRow({
  workflow,
  onOpen,
  onDelete,
}: {
  workflow: Workflow;
  onOpen: (workflowId: string) => void;
  onDelete: (workflowId: string) => void;
}) {
  const [menuOpen, setMenuOpen] =
    useState(false);

  const [opening, setOpening] =
    useState(false);

  const handleOpen = async () => {
    setOpening(true);

    try {
      await onOpen(workflow.id);
    } finally {
      setOpening(false);
    }
  };

  const isActive =
    workflow.status === 'PUBLISHED' ||
    workflow.status === 'ACTIVE';

  return (
    <div className="border-b border-slate-100 px-5 py-5 last:border-b-0">
      <div className="flex items-center justify-between gap-6">
        {/* Workflow Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              {workflow.name}
            </h2>

            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isActive
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-amber-50 text-amber-600'
              }`}
            >
              {workflow.status ??
                'DRAFT'}
            </span>
          </div>

          <p className="mt-1 text-xs text-slate-400">
            {workflow.description ||
              'Automation workflow'}
          </p>

          <div className="mt-3 flex items-center gap-2">
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-500">
              Workflow
            </span>

            <span className="text-xs text-slate-300">
              →
            </span>

            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-500">
              Editor
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleOpen}
            disabled={opening}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {opening
              ? 'Opening...'
              : 'Open'}
          </button>

          <div className="relative">
            <button
              type="button"
              className="rounded-md border border-transparent px-2 py-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              onClick={() =>
                setMenuOpen(
                  (current) =>
                    !current,
                )
              }
              aria-label={`Workflow actions for ${workflow.name}`}
            >
              ⋯
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-10 mt-2 w-28 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(
                      workflow.id,
                    );
                  }}
                  className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}