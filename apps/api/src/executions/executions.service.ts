import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExecutionStatus,
  ExecutionStepStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SlackNodeExecutor } from './executors/slack.executor';
import { GmailNodeExecutor } from './executors/gmail.executor';
import { PostgresNodeExecutor } from './executors/postgres.executor';
import { HttpNodeExecutor } from './executors/http.executor';
import { AiNodeExecutor } from './executors/ai.executor';
import type { NodeExecutionResult } from './executors/node-executor';
import {
  resolveNodeConfig,
  VariableResolutionError,
  type ResolverContext,
} from './variable-resolver';

export type ExecutionListFilters = {
  status?: ExecutionStatus;
  workflowId?: string;
  workflowVersionId?: string;
  skip?: number;
  take?: number;
};

@Injectable()
export class ExecutionsService {
  constructor(
    private readonly prisma: PrismaService,
    // Optional so direct `new ExecutionsService(prisma)` (unit tests) keeps
    // working; always injected by Nest. Integration-backed node types need them.
    private readonly slackExecutor?: SlackNodeExecutor,
    private readonly gmailExecutor?: GmailNodeExecutor,
    private readonly postgresExecutor?: PostgresNodeExecutor,
    private readonly httpExecutor?: HttpNodeExecutor,
    private readonly aiExecutor?: AiNodeExecutor,
  ) {}

  async findAll(filters: ExecutionListFilters = {}) {
    const {
      status,
      workflowId,
      workflowVersionId,
      skip = 0,
      take = 50,
    } = filters;

    const where: Prisma.ExecutionWhereInput = {
      ...(status ? { status } : {}),
      ...(workflowId ? { workflowId } : {}),
      ...(workflowVersionId ? { workflowVersionId } : {}),
    };

    return this.prisma.execution.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take,
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Aggregate execution counts by status — computed in the database so it
   * is accurate regardless of any list pagination. Powers the Dashboard's
   * Executions / Success Rate / Running metrics from a single call.
   *
   * - `completed` = terminal executions (SUCCEEDED + FAILED + CANCELLED)
   * - `running`   = active executions (PENDING + RUNNING)
   */
  async getStats() {
    const grouped = await this.prisma.execution.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const byStatus: Record<ExecutionStatus, number> = {
      PENDING: 0,
      RUNNING: 0,
      SUCCEEDED: 0,
      FAILED: 0,
      CANCELLED: 0,
    };
    for (const row of grouped) {
      byStatus[row.status] = row._count._all;
    }

    const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
    const running = byStatus.PENDING + byStatus.RUNNING;
    const completed =
      byStatus.SUCCEEDED + byStatus.FAILED + byStatus.CANCELLED;

    return {
      total,
      running,
      completed,
      succeeded: byStatus.SUCCEEDED,
      failed: byStatus.FAILED,
      cancelled: byStatus.CANCELLED,
      pending: byStatus.PENDING,
    };
  }

  /**
   * Load the runtime variable map for an execution.
   *
   * - When `workspaceId` is provided (every authenticated HTTP run), only
   *   that workspace's variables plus legacy unscoped (`workspaceId = null`)
   *   variables are loaded; a workspace-scoped variable wins on a name
   *   collision. A workflow in workspace A can never see workspace B's
   *   variables.
   * - When it is absent (direct service calls / older tests) only legacy
   *   unscoped variables are loaded.
   * - `Secret`-typed variables are never placed in the runtime map, so a
   *   secret value can never be interpolated into node output/logs.
   *
   * This method never logs variable values.
   */
  private async loadWorkspaceVariables(
    workspaceId?: string,
  ): Promise<Record<string, unknown>> {
    try {
      const where = workspaceId
        ? { OR: [{ workspaceId }, { workspaceId: null }] }
        : { workspaceId: null };

      const rows = await this.prisma.variable.findMany({
        where: where as Prisma.VariableWhereInput,
        orderBy: { updatedAt: 'asc' },
      });

      const map: Record<string, unknown> = {};
      // Apply unscoped first, then scoped, so scoped overrides on collision.
      const ordered = [
        ...rows.filter((r) => r.workspaceId == null),
        ...rows.filter((r) => r.workspaceId != null),
      ];
      for (const r of ordered) {
        if (!r || !r.name || r.type === 'Secret') continue;
        switch (r.type) {
          case 'Number':
            map[r.name] = Number(r.value);
            break;
          case 'Boolean':
            map[r.name] = r.value === 'true';
            break;
          default:
            map[r.name] = r.value;
            break;
        }
      }
      return map;
    } catch {
      // Variables table missing / incompatible: resolve against an empty map.
      return {};
    }
  }

  async findOne(id: string) {
    const execution = await this.prisma.execution.findUnique({
      where: {
        id,
      },
      include: {
        workflow: true,
        workflowVersion: {
          include: {
            nodes: {
              orderBy: {
                createdAt: 'asc',
              },
            },
            edges: {
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
        steps: {
          orderBy: {
            createdAt: 'asc',
          },
          include: {
            node: true,
          },
        },
      },
    });

    if (!execution) {
      throw new NotFoundException(
        `Execution with id "${id}" not found`,
      );
    }

    return execution;
  }

  /**
   * Delete a single execution record. Its `ExecutionStep` rows are removed by
   * the schema's `onDelete: Cascade`. Nothing else — no workflow, workflow
   * version, node, integration, credential, variable, or other execution — is
   * affected.
   */
  async remove(id: string) {
    const existing = await this.prisma.execution.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(
        `Execution with id "${id}" not found`,
      );
    }

    await this.prisma.execution.delete({ where: { id } });

    return { id, deleted: true as const };
  }

  async runWorkflow(
    workflowId: string,
    workflowVersionId?: string,
    input: Record<string, unknown> = {},
    triggerType = 'MANUAL',
    variables: Record<string, unknown> = {},
    // Resolved from the authenticated request that started the run (never
    // from workflow/node data or the client body). Integration-backed
    // nodes require it to load workspace-scoped credentials.
    workspaceId?: string,
  ) {
    const version = workflowVersionId
      ? await this.prisma.workflowVersion.findUnique({
          where: {
            id: workflowVersionId,
          },
          include: {
            nodes: {
              orderBy: {
                createdAt: 'asc',
              },
            },
            edges: {
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        })
      : await this.prisma.workflowVersion.findFirst({
          where: {
            workflowId,
          },
          orderBy: {
            version: 'desc',
          },
          include: {
            nodes: {
              orderBy: {
                createdAt: 'asc',
              },
            },
            edges: {
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        });

    if (!version) {
      throw new NotFoundException(
        `Workflow version for workflow "${workflowId}" not found`,
      );
    }

    const nodeMap = new Map(
      version.nodes.map((node) => [node.id, node]),
    );
    const adjacency = new Map<string, string[]>();

    for (const node of version.nodes) {
      adjacency.set(node.id, []);
    }

    for (const edge of version.edges) {
      adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    }

    this.assertAcyclic(adjacency);

    const execution = await this.prisma.execution.create({
      data: {
        workflowId,
        workflowVersionId: version.id,
        status: ExecutionStatus.RUNNING,
        triggerType,
        input: input as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });

    const dbVariables = await this.loadWorkspaceVariables(workspaceId);

    const runtimeVariables = this.normalizeContextObject({
      ...(this.normalizeContextObject((version as any)?.variables ?? {})),
      // load variables from the database so UI-triggered executions (which don't
      // pass an explicit `variables` payload) can still resolve `{{ vars.X }}`
      ...dbVariables,
      ...this.normalizeContextObject(variables),
    });

    const startNodes = this.getStartNodes(version.nodes, version.edges);
    const queuedNodeIds = [...startNodes];
    const visitedNodeIds = new Set<string>();
    const executedNodeIds = new Set<string>();
    const outputByNode = new Map<string, Record<string, unknown>>();
    const executionSteps: Array<{
      id: string;
      nodeId: string;
      status: ExecutionStepStatus;
      duration?: number | null;
      output?: Record<string, unknown> | null;
      error?: string | null;
    }> = [];

    let aggregateError: string | null = null;

    while (queuedNodeIds.length > 0) {
      const nodeId = queuedNodeIds.shift();
      if (!nodeId || visitedNodeIds.has(nodeId)) {
        continue;
      }

      const node = nodeMap.get(nodeId);
      if (!node) {
        continue;
      }

      visitedNodeIds.add(nodeId);
      const stepStartedAt = new Date();
      const step = await this.prisma.executionStep.create({
        data: {
          executionId: execution.id,
          nodeId: node.id,
          status: ExecutionStepStatus.RUNNING,
          input: {
            nodeId: node.id,
            nodeType: node.type,
            label: node.label,
            config: node.config ?? {},
            input,
            variables: runtimeVariables,
          } as Prisma.InputJsonValue,
          startedAt: stepStartedAt,
        },
      });

      const runtimeContext = {
        workspaceId,
        workflow: {
          id: workflowId,
          versionId: version.id,
          variables: runtimeVariables,
        },
        execution: {
          id: execution.id,
          triggerType,
        },
        input,
        variables: runtimeVariables,
        previous: this.buildPreviousContext(outputByNode),
      };

      const result = await this.evaluateNodeExecution(node, runtimeContext);
      const stepCompletedAt = new Date();
      const duration =
        stepCompletedAt.getTime() - stepStartedAt.getTime();

      const savedStep = await this.prisma.executionStep.update({
        where: {
          id: step.id,
        },
        data: {
          status: result.status,
          output: result.output as Prisma.InputJsonValue,
          error: result.error ?? null,
          completedAt: stepCompletedAt,
          duration,
        },
      });

      executionSteps.push({
        id: savedStep.id,
        nodeId: savedStep.nodeId,
        status: savedStep.status,
        duration: savedStep.duration ?? duration,
        output: (savedStep.output as Record<string, unknown>) ?? null,
        error: savedStep.error ?? null,
      });

      executedNodeIds.add(nodeId);
      if (result.output) {
        outputByNode.set(nodeId, result.output as Record<string, unknown>);
      }

      if (result.error) {
        aggregateError = result.error;
      }

      const nextNodeIds = this.getNextNodeIds(
        version.edges,
        nodeId,
        result.branch as 'true' | 'false' | null,
      );

      for (const nextNodeId of nextNodeIds) {
        if (!visitedNodeIds.has(nextNodeId) && !queuedNodeIds.includes(nextNodeId)) {
          queuedNodeIds.push(nextNodeId);
        }
      }

      if (result.status === ExecutionStepStatus.FAILED) {
        break;
      }
    }

    for (const node of version.nodes) {
      if (executedNodeIds.has(node.id)) {
        continue;
      }

      const skippedStep = await this.prisma.executionStep.create({
        data: {
          executionId: execution.id,
          nodeId: node.id,
          status: ExecutionStepStatus.SKIPPED,
          input: {
            nodeId: node.id,
            nodeType: node.type,
            label: node.label,
            config: node.config ?? {},
            reason: 'Node is not part of the active execution path',
          },
          output: {
            skipped: true,
            reason: 'Node is not part of the active execution path',
          },
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 0,
        },
      });

      executionSteps.push({
        id: skippedStep.id,
        nodeId: skippedStep.nodeId,
        status: skippedStep.status,
        duration: skippedStep.duration ?? 0,
        output: (skippedStep.output as Record<string, unknown>) ?? null,
        error: skippedStep.error ?? null,
      });
    }

    const finalStatus =
      executionSteps.some(
        (step) => step.status === ExecutionStepStatus.FAILED,
      )
        ? ExecutionStatus.FAILED
        : ExecutionStatus.SUCCEEDED;

    const executionOutput = {
      status: finalStatus,
      success: finalStatus === ExecutionStatus.SUCCEEDED,
      error: aggregateError,
      nodes: executionSteps.map((step) => ({
        id: step.id,
        nodeId: step.nodeId,
        status: step.status,
        duration: step.duration ?? 0,
        output: step.output ?? null,
        error: step.error ?? null,
      })),
    } as Prisma.InputJsonValue;

    await this.prisma.execution.update({
      where: {
        id: execution.id,
      },
      data: {
        status: finalStatus,
        output: executionOutput,
        error: aggregateError,
        completedAt: new Date(),
      },
    });

    return this.findOne(execution.id);
  }

  private getStartNodes(
    nodes: Array<{ id: string; type?: string | null }>,
    edges: Array<{ sourceNodeId: string; targetNodeId: string }>,
  ) {
    const hasIncoming = new Set(
      edges.map((edge) => edge.targetNodeId),
    );

    const fallbackStartNodes = nodes
      .filter((node) => !hasIncoming.has(node.id))
      .map((node) => node.id);

    return fallbackStartNodes.length > 0
      ? fallbackStartNodes
      : nodes.map((node) => node.id);
  }

  private assertAcyclic(adjacency: Map<string, string[]>) {
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (nodeId: string, path: string[] = []) => {
      if (visiting.has(nodeId)) {
        const cyclePath = [...path, nodeId];
        throw new Error(
          `Workflow graph contains a cycle: ${cyclePath.join(' -> ')}`,
        );
      }

      if (visited.has(nodeId)) {
        return;
      }

      visiting.add(nodeId);
      const nextNodeIds = adjacency.get(nodeId) ?? [];
      for (const nextNodeId of nextNodeIds) {
        visit(nextNodeId, [...path, nodeId]);
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
    };

    for (const nodeId of adjacency.keys()) {
      if (!visited.has(nodeId)) {
        visit(nodeId);
      }
    }
  }

  private getNextNodeIds(
    edges: Array<{
      sourceNodeId: string;
      targetNodeId: string;
      sourceHandle?: string | null;
    }>,
    nodeId: string,
    branch?: 'true' | 'false' | null,
  ) {
    const outgoing = edges.filter((edge) => edge.sourceNodeId === nodeId);

    if (!branch) {
      return outgoing.map((edge) => edge.targetNodeId);
    }

    const selectedHandle = branch === 'true' ? 'true' : 'false';

    return outgoing
      .filter((edge) => {
        if (edge.sourceHandle) {
          return edge.sourceHandle === selectedHandle;
        }

        return true;
      })
      .map((edge) => edge.targetNodeId);
  }

  private buildPreviousContext(
    outputByNode: Map<string, Record<string, unknown>>,
  ): Record<string, unknown> {
    const previous: Record<string, unknown> = {};

    for (const [nodeId, output] of outputByNode.entries()) {
      previous[nodeId] = output;
    }

    const lastOutput = [...outputByNode.values()].at(-1);
    if (lastOutput !== undefined) {
      previous.output = lastOutput;
    }

    return previous;
  }

  private normalizeContextObject(
    value: unknown,
  ): Record<string, unknown> {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      return value as Record<string, unknown>;
    }

    return {};
  }

  private async evaluateNodeExecution(
    node: {
      id: string;
      label: string;
      type?: string | null;
      config?: Prisma.JsonValue | null;
    },
    context: {
      workspaceId?: string;
      workflow: { id: string; versionId: string; variables?: Record<string, unknown> };
      execution: { id: string; triggerType: string };
      input: Record<string, unknown>;
      variables: Record<string, unknown>;
      previous: Record<string, unknown>;
    },
  ): Promise<NodeExecutionResult> {
    // evaluateNodeExecution: no diagnostic logging in production

    const rawConfig =
      typeof node.config === 'object' &&
      node.config !== null &&
      !Array.isArray(node.config)
        ? (node.config as Record<string, any>)
        : {};

    const runtimeContext: ResolverContext = {
      input: context.input,
      variables: context.variables,
      workflow: context.workflow as Record<string, unknown>,
      execution: context.execution as Record<string, unknown>,
      previous: context.previous,
    };

    let resolvedConfig: Record<string, unknown>;

    try {
      resolvedConfig = resolveNodeConfig(
        rawConfig,
        runtimeContext,
      ) as Record<string, unknown>;
    } catch (error) {
      const isVariableError = error instanceof VariableResolutionError;
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to resolve node configuration';
      return {
        status: ExecutionStepStatus.FAILED,
        output: {
          nodeId: node.id,
          nodeType: node.type ?? 'UNKNOWN',
          label: node.label,
          input: {
            ...context.input,
            workflow: context.workflow,
            execution: context.execution,
            previous: context.previous,
            variables: context.variables,
          },
          // The persisted node config is echoed verbatim ({{ }} intact).
          config: rawConfig,
          code: isVariableError
            ? (error as VariableResolutionError).code
            : 'CONFIG_RESOLUTION_FAILED',
          status: 'FAILED',
        },
        error: message,
        branch: null,
      };
    }

    const resolvedInput = {
      ...context.input,
      workflow: context.workflow,
      execution: context.execution,
      previous: context.previous,
      variables: context.variables,
    };

    const shouldFail =
      resolvedConfig.shouldFail === true ||
      resolvedConfig.fail === true ||
      resolvedConfig.error === 'FAIL';

    if (node.type === 'CONDITION') {
      // `resolvedConfig` is already fully resolved by resolveNodeConfig().
      const leftValue = resolvedConfig.leftValue ?? '';
      const rightValue = resolvedConfig.rightValue ?? '';
      const operator = String(resolvedConfig.operator ?? 'equals');
      const result = this.compareValues(
        leftValue,
        operator,
        rightValue,
      );

      const outcome = {
        nodeId: node.id,
        nodeType: node.type ?? 'UNKNOWN',
        label: node.label,
        input: resolvedInput,
        config: resolvedConfig,
        branch: result ? 'true' : 'false',
        leftValue,
        rightValue,
        operator,
      };

      return {
        status: ExecutionStepStatus.SUCCEEDED,
        output: {
          ...outcome,
          status: 'SUCCEEDED',
        },
        error: null,
        branch: result ? 'true' : 'false',
      };
    }

    // Integration-backed nodes: real external calls, dispatched to a
    // dedicated executor. The decrypted credential stays server-side.
    if (node.type === 'SLACK') {
      if (!this.slackExecutor) {
        return {
          status: ExecutionStepStatus.FAILED,
          output: {
            nodeId: node.id,
            nodeType: 'SLACK',
            label: node.label,
            config: rawConfig,
            status: 'FAILED',
          },
          error: 'Slack execution is not available.',
          branch: null,
        };
      }
      return this.slackExecutor.execute(
        { id: node.id, label: node.label, type: node.type },
        resolvedConfig,
        {
          workspaceId: context.workspaceId,
          workflow: context.workflow,
          execution: context.execution,
          input: context.input,
          variables: context.variables,
          previous: context.previous,
        },
      );
    }

    if (node.type === 'GMAIL') {
      if (!this.gmailExecutor) {
        return {
          status: ExecutionStepStatus.FAILED,
          output: {
            nodeId: node.id,
            nodeType: 'GMAIL',
            label: node.label,
            config: rawConfig,
            status: 'FAILED',
          },
          error: 'Gmail execution is not available.',
          branch: null,
        };
      }
      return this.gmailExecutor.execute(
        { id: node.id, label: node.label, type: node.type },
        resolvedConfig,
        {
          workspaceId: context.workspaceId,
          workflow: context.workflow,
          execution: context.execution,
          input: context.input,
          variables: context.variables,
          previous: context.previous,
        },
      );
    }

    if (node.type === 'POSTGRES') {
      if (!this.postgresExecutor) {
        return {
          status: ExecutionStepStatus.FAILED,
          output: {
            nodeId: node.id,
            nodeType: 'POSTGRES',
            label: node.label,
            config: rawConfig,
            status: 'FAILED',
          },
          error: 'PostgreSQL execution is not available.',
          branch: null,
        };
      }
      return this.postgresExecutor.execute(
        { id: node.id, label: node.label, type: node.type },
        resolvedConfig,
        {
          workspaceId: context.workspaceId,
          workflow: context.workflow,
          execution: context.execution,
          input: context.input,
          variables: context.variables,
          previous: context.previous,
        },
      );
    }

    // HTTP Request: inline-configured (method / url / headers / body), all
    // templates already resolved above. Only dispatch to the real executor
    // when a URL is configured; a URL-less node keeps the generic pass-through
    // behaviour relied on elsewhere.
    if (node.type === 'HTTP_REQUEST' && this.httpExecutor) {
      const url =
        typeof resolvedConfig.url === 'string' ? resolvedConfig.url.trim() : '';
      if (url !== '') {
        return this.httpExecutor.execute(
          { id: node.id, label: node.label, type: node.type },
          resolvedConfig,
          {
            workspaceId: context.workspaceId,
            workflow: context.workflow,
            execution: context.execution,
            input: context.input,
            variables: context.variables,
            previous: context.previous,
          },
        );
      }
    }

    // AI Prompt: a real OpenAI-backed completion. All `{{ }}` templates in
    // the config are already resolved above; the decrypted credential is
    // resolved inside the executor and stays server-side.
    if (node.type === 'AI_PROMPT') {
      if (!this.aiExecutor) {
        return {
          status: ExecutionStepStatus.FAILED,
          output: {
            nodeId: node.id,
            nodeType: 'AI_PROMPT',
            label: node.label,
            config: rawConfig,
            status: 'FAILED',
          },
          error: 'AI execution is not available.',
          branch: null,
        };
      }
      return this.aiExecutor.execute(
        { id: node.id, label: node.label, type: node.type },
        resolvedConfig,
        {
          workspaceId: context.workspaceId,
          workflow: context.workflow,
          execution: context.execution,
          input: context.input,
          variables: context.variables,
          previous: context.previous,
        },
      );
    }

    if (shouldFail) {
      return {
        status: ExecutionStepStatus.FAILED,
        output: {
          nodeId: node.id,
          nodeType: node.type ?? 'UNKNOWN',
          label: node.label,
          input: resolvedInput,
          config: resolvedConfig,
          status: 'FAILED',
        },
        error: `Node "${node.label}" failed`,
      };
    }

    return {
      status: ExecutionStepStatus.SUCCEEDED,
      output: {
        nodeId: node.id,
        nodeType: node.type ?? 'UNKNOWN',
        label: node.label,
        input: resolvedInput,
        config: resolvedConfig,
        status: 'SUCCEEDED',
      },
      error: null,
      branch: null,
    };
  }

  private compareValues(
    left: unknown,
    operator: string,
    right: unknown,
  ) {
    switch (operator) {
      case 'not_equals':
        return left !== right;
      case 'contains':
        return String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase());
      case 'greater_than':
        return Number(left ?? 0) > Number(right ?? 0);
      case 'less_than':
        return Number(left ?? 0) < Number(right ?? 0);
      case 'equals':
      default:
        return left === right || String(left ?? '') === String(right ?? '');
    }
  }
}
