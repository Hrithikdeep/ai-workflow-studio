import { NotFoundException } from '@nestjs/common';
import { ExecutionStatus } from '@prisma/client';

import { ExecutionsService } from './executions.service';
import { resolveString } from './variable-resolver';

describe('ExecutionsService', () => {
  it('returns empty list when no executions exist', async () => {
    const prisma = {
      execution: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const service = new ExecutionsService(prisma);

    await expect(service.findAll()).resolves.toEqual([]);
    expect(prisma.execution.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 50,
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  });

  it('throws when a requested execution does not exist', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as any;

    const service = new ExecutionsService(prisma);

    await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
    expect(prisma.execution.findUnique).toHaveBeenCalledWith({
      where: { id: 'missing-id' },
      include: {
        workflow: true,
        workflowVersion: {
          include: {
            nodes: {
              orderBy: { createdAt: 'asc' },
            },
            edges: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        steps: {
          orderBy: { createdAt: 'asc' },
          include: {
            node: true,
          },
        },
      },
    });
  });

  it('deletes an existing execution (steps cascade) and touches nothing else', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue({ id: 'exec-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'exec-1' }),
      },
    } as any;

    const service = new ExecutionsService(prisma);

    await expect(service.remove('exec-1')).resolves.toEqual({
      id: 'exec-1',
      deleted: true,
    });
    expect(prisma.execution.findUnique).toHaveBeenCalledWith({
      where: { id: 'exec-1' },
      select: { id: true },
    });
    expect(prisma.execution.delete).toHaveBeenCalledWith({
      where: { id: 'exec-1' },
    });
  });

  it('throws NotFound and does not delete when the execution is missing', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue(null),
        delete: jest.fn(),
      },
    } as any;

    const service = new ExecutionsService(prisma);

    await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
    expect(prisma.execution.delete).not.toHaveBeenCalled();
  });

  it('applies status and pagination filters when listing executions', async () => {
    const prisma = {
      execution: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const service = new ExecutionsService(prisma);

    await service.findAll({
      status: ExecutionStatus.FAILED,
      workflowId: 'workflow-123',
      workflowVersionId: 'version-456',
      skip: 10,
      take: 25,
    });

    expect(prisma.execution.findMany).toHaveBeenCalledWith({
      where: {
        status: ExecutionStatus.FAILED,
        workflowId: 'workflow-123',
        workflowVersionId: 'version-456',
      },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 25,
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  });

  it('creates a workflow execution and persists node trace steps with final output', async () => {
    const baseDate = new Date('2026-08-25T00:00:00.000Z');

    const prisma = {
      workflowVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-456',
          workflowId: 'workflow-123',
          version: 1,
          nodes: [
            {
              id: 'node-1',
              type: 'WEBHOOK',
              label: 'Trigger',
              config: { value: 'hello' },
              createdAt: baseDate,
            },
            {
              id: 'node-2',
              type: 'OUTPUT',
              label: 'Output',
              config: { value: 'done' },
              createdAt: baseDate,
            },
          ],
          edges: [],
        }),
      },
      execution: {
        create: jest.fn().mockResolvedValue({
          id: 'exec-1',
          workflowId: 'workflow-123',
          workflowVersionId: 'version-456',
          status: ExecutionStatus.RUNNING,
          triggerType: 'MANUAL',
          input: { foo: 'bar' },
          output: null,
          error: null,
          startedAt: baseDate,
          completedAt: null,
          createdAt: baseDate,
          updatedAt: baseDate,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'exec-1',
          workflowId: 'workflow-123',
          workflowVersionId: 'version-456',
          status: ExecutionStatus.SUCCEEDED,
          triggerType: 'MANUAL',
          input: { foo: 'bar' },
          output: {
            success: true,
            nodes: [
              { nodeId: 'node-1', status: 'SUCCEEDED' },
              { nodeId: 'node-2', status: 'SUCCEEDED' },
            ],
          },
          error: null,
          startedAt: baseDate,
          completedAt: baseDate,
          createdAt: baseDate,
          updatedAt: baseDate,
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'exec-1',
          workflowId: 'workflow-123',
          workflowVersionId: 'version-456',
          status: ExecutionStatus.SUCCEEDED,
          triggerType: 'MANUAL',
          input: { foo: 'bar' },
          output: {
            success: true,
            nodes: [
              { nodeId: 'node-1', status: 'SUCCEEDED' },
              { nodeId: 'node-2', status: 'SUCCEEDED' },
            ],
          },
          error: null,
          startedAt: baseDate,
          completedAt: baseDate,
          createdAt: baseDate,
          updatedAt: baseDate,
          workflow: { id: 'workflow-123', name: 'Demo workflow' },
          workflowVersion: {
            id: 'version-456',
            version: 1,
            nodes: [
              { id: 'node-1', type: 'WEBHOOK', label: 'Trigger' },
              { id: 'node-2', type: 'OUTPUT', label: 'Output' },
            ],
            edges: [],
          },
          steps: [
            { id: 'step-1', nodeId: 'node-1', status: 'SUCCEEDED', duration: 10 },
            { id: 'step-2', nodeId: 'node-2', status: 'SUCCEEDED', duration: 12 },
          ],
        }),
      },
      executionStep: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: `step-${data.nodeId}`,
          executionId: data.executionId,
          nodeId: data.nodeId,
          status: 'RUNNING',
          input: data.input,
          output: null,
          error: null,
          startedAt: baseDate,
          completedAt: null,
          duration: null,
          createdAt: baseDate,
          updatedAt: baseDate,
        })),
        update: jest.fn().mockImplementation(({ data }) => ({
          id: `step-${data.nodeId}`,
          ...data,
          startedAt: baseDate,
          completedAt: baseDate,
          duration: 50,
          updatedAt: baseDate,
        })),
      },
    } as any;

    const service = new ExecutionsService(prisma);

    const result = await service.runWorkflow('workflow-123', 'version-456', { foo: 'bar' });

    expect(prisma.execution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowId: 'workflow-123',
          workflowVersionId: 'version-456',
          triggerType: 'MANUAL',
          status: ExecutionStatus.RUNNING,
        }),
      }),
    );
    expect(prisma.executionStep.create).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(ExecutionStatus.SUCCEEDED);
    expect(result.steps).toHaveLength(2);
    expect(result.output).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
  });

  it('resolves workflow variables and previous output mappings through the canonical runtime context', async () => {
    const prisma = {
      workflowVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-vars',
          workflowId: 'workflow-vars',
          version: 1,
          nodes: [
            {
              id: 'start',
              type: 'MANUAL_TRIGGER',
              label: 'Start',
              config: { greeting: 'Hello {{ input.customer.name }}', region: '{{ variables.region }}' },
              createdAt: new Date('2026-08-25T00:00:00.000Z'),
            },
            {
              id: 'respond',
              type: 'OUTPUT',
              label: 'Respond',
              config: {
                message: '{{ previous.output.config.greeting }} in {{ variables.region }}',
                customer: '{{ input.customer.name }}',
              },
              createdAt: new Date('2026-08-25T00:00:01.000Z'),
            },
          ],
          edges: [
            { id: 'e1', sourceNodeId: 'start', targetNodeId: 'respond', sourceHandle: null, targetHandle: null },
          ],
        }),
      },
      execution: {
        create: jest.fn().mockResolvedValue({ id: 'exec-vars' }),
        update: jest.fn().mockResolvedValue({ id: 'exec-vars', status: ExecutionStatus.SUCCEEDED }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'exec-vars',
          status: ExecutionStatus.SUCCEEDED,
          output: { success: true },
          error: null,
          steps: [
            { id: 'step-start', nodeId: 'start', status: 'SUCCEEDED' },
            { id: 'step-respond', nodeId: 'respond', status: 'SUCCEEDED' },
          ],
          workflow: { id: 'workflow-vars', name: 'Variable workflow' },
          workflowVersion: { id: 'version-vars', version: 1, nodes: [], edges: [] },
        }),
      },
      executionStep: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: `step-${data.nodeId}`,
          executionId: data.executionId,
          nodeId: data.nodeId,
          status: 'RUNNING',
          input: data.input,
        })),
        update: jest.fn().mockImplementation(({ data, where }) => ({
          id: where.id,
          nodeId: data.output?.nodeId ?? where.id.replace('step-', ''),
          status: data.status,
          output: data.output,
          error: data.error,
        })),
      },
    } as any;

    const service = new ExecutionsService(prisma);
    const result = await service.runWorkflow(
      'workflow-vars',
      'version-vars',
      { customer: { name: 'Ada' } },
      'MANUAL',
      { region: 'us-east-1' },
    );

    expect(result.status).toBe(ExecutionStatus.SUCCEEDED);
    expect(prisma.executionStep.update).toHaveBeenCalled();
    const respondUpdate = prisma.executionStep.update.mock.calls.find(
      ([args]) => args.where.id === 'step-respond',
    );
    expect(respondUpdate).toBeDefined();
    expect(respondUpdate[0].data.output).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({
          message: 'Hello Ada in us-east-1',
          customer: 'Ada',
        }),
      }),
    );
  });

  it('resolves the vars alias from workflow-scoped variables', () => {
    const value = resolveString('{{ vars.region }}', {
      input: {},
      variables: {},
      workflow: {
        id: 'workflow-vars',
        versionId: 'version-vars',
        variables: { region: 'us-east-1' },
      },
      execution: { id: 'exec-vars', triggerType: 'MANUAL' },
      previous: {},
    });

    expect(value).toBe('us-east-1');
  });

  it('fails deterministically when a configured mapping cannot be resolved', async () => {
    const prisma = {
      workflowVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-missing',
          workflowId: 'workflow-missing',
          version: 1,
          nodes: [
            {
              id: 'missing-node',
              type: 'HTTP_REQUEST',
              label: 'Missing mapping',
              config: { message: '{{ input.customer.missing.name }}' },
              createdAt: new Date('2026-08-25T00:00:00.000Z'),
            },
          ],
          edges: [],
        }),
      },
      execution: {
        create: jest.fn().mockResolvedValue({ id: 'exec-missing' }),
        update: jest.fn().mockResolvedValue({ id: 'exec-missing', status: ExecutionStatus.FAILED }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'exec-missing',
          status: ExecutionStatus.FAILED,
          output: { success: false, status: ExecutionStatus.FAILED },
          error: 'Unable to resolve value: input.customer.missing.name',
          steps: [{ id: 'step-missing-node', nodeId: 'missing-node', status: 'FAILED' }],
          workflow: { id: 'workflow-missing', name: 'Missing workflow' },
          workflowVersion: { id: 'version-missing', version: 1, nodes: [], edges: [] },
        }),
      },
      executionStep: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: `step-${data.nodeId}`,
          executionId: data.executionId,
          nodeId: data.nodeId,
          status: 'RUNNING',
        })),
        update: jest.fn().mockImplementation(({ data, where }) => ({
          id: where.id,
          nodeId: where.id.replace('step-', ''),
          status: data.status,
          output: data.output,
          error: data.error,
        })),
      },
    } as any;

    const service = new ExecutionsService(prisma);
    const result = await service.runWorkflow('workflow-missing', 'version-missing', { customer: {} });

    expect(result.status).toBe(ExecutionStatus.FAILED);
    expect(result.error).toContain('Unable to resolve value: input.customer.missing.name');
  });

  it('marks a failed node and execution when a workflow node declares a failure', async () => {
    const prisma = {
      workflowVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-999',
          workflowId: 'workflow-999',
          version: 1,
          nodes: [
            {
              id: 'node-fail',
              type: 'HTTP_REQUEST',
              label: 'Failing node',
              config: { shouldFail: true },
              createdAt: new Date('2026-08-25T00:00:00.000Z'),
            },
          ],
          edges: [],
        }),
      },
      execution: {
        create: jest.fn().mockResolvedValue({ id: 'exec-fail' }),
        update: jest.fn().mockResolvedValue({ id: 'exec-fail', status: ExecutionStatus.FAILED }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'exec-fail',
          status: ExecutionStatus.FAILED,
          output: {
            success: false,
            status: ExecutionStatus.FAILED,
            error: 'Node "Failing node" failed',
            nodes: [{ id: 'step-fail', nodeId: 'node-fail', status: 'FAILED' }],
          },
          error: 'Node "Failing node" failed',
          steps: [{ id: 'step-fail', status: 'FAILED', nodeId: 'node-fail' }],
          workflow: { id: 'workflow-999', name: 'Failing workflow' },
          workflowVersion: { id: 'version-999', version: 1, nodes: [], edges: [] },
        }),
      },
      executionStep: {
        create: jest.fn().mockResolvedValue({ id: 'step-fail', status: 'RUNNING' }),
        update: jest.fn().mockResolvedValue({ id: 'step-fail', status: 'FAILED' }),
      },
    } as any;

    const service = new ExecutionsService(prisma);

    const result = await service.runWorkflow('workflow-999', 'version-999', {});

    expect(result.status).toBe(ExecutionStatus.FAILED);
    expect(result.error).toContain('Failing node');
    expect(result.output).toEqual(
      expect.objectContaining({
        success: false,
        status: ExecutionStatus.FAILED,
        error: 'Node "Failing node" failed',
      }),
    );
  });

  it('executes a linear graph by edge connectivity instead of node array order', async () => {
    const prisma = {
      workflowVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-order',
          workflowId: 'workflow-order',
          version: 1,
          nodes: [
            { id: 'c', type: 'OUTPUT', label: 'C', config: {}, createdAt: new Date() },
            { id: 'a', type: 'MANUAL_TRIGGER', label: 'A', config: {}, createdAt: new Date() },
            { id: 'b', type: 'HTTP_REQUEST', label: 'B', config: {}, createdAt: new Date() },
          ],
          edges: [
            { id: 'ea', sourceNodeId: 'a', targetNodeId: 'b', sourceHandle: null, targetHandle: null },
            { id: 'eb', sourceNodeId: 'b', targetNodeId: 'c', sourceHandle: null, targetHandle: null },
          ],
        }),
      },
      execution: {
        create: jest.fn().mockResolvedValue({ id: 'exec-order' }),
        update: jest.fn().mockResolvedValue({ id: 'exec-order', status: ExecutionStatus.SUCCEEDED }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'exec-order',
          status: ExecutionStatus.SUCCEEDED,
          output: { success: true, status: ExecutionStatus.SUCCEEDED, nodes: [] },
          error: null,
          steps: [
            { id: 'step-a', nodeId: 'a', status: 'SUCCEEDED' },
            { id: 'step-b', nodeId: 'b', status: 'SUCCEEDED' },
            { id: 'step-c', nodeId: 'c', status: 'SUCCEEDED' },
          ],
          workflow: { id: 'workflow-order', name: 'Graph Order Workflow' },
          workflowVersion: { id: 'version-order', version: 1, nodes: [], edges: [] },
        }),
      },
      executionStep: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: `step-${data.nodeId}`,
          executionId: data.executionId,
          nodeId: data.nodeId,
          status: 'RUNNING',
        })),
        update: jest.fn().mockImplementation(({ data, where }) => ({
          id: where.id,
          nodeId: where.id.replace('step-', ''),
          ...data,
          status: data.status,
        })),
      },
    } as any;

    const service = new ExecutionsService(prisma);

    const result = await service.runWorkflow('workflow-order', 'version-order', { foo: 'bar' });

    expect(result.status).toBe(ExecutionStatus.SUCCEEDED);
    expect(prisma.executionStep.create.mock.calls.map((call) => call[0].data.nodeId)).toEqual(['a', 'b', 'c']);
  });

  it('executes only the true branch for a condition node', async () => {
    const prisma = {
      workflowVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-true',
          workflowId: 'workflow-true',
          version: 1,
          nodes: [
            { id: 'a', type: 'MANUAL_TRIGGER', label: 'A', config: {}, createdAt: new Date() },
            { id: 'cond', type: 'CONDITION', label: 'Condition', config: { leftValue: '{{ input.priority }}', operator: 'equals', rightValue: 'urgent' }, createdAt: new Date() },
            { id: 'b', type: 'OUTPUT', label: 'B', config: {}, createdAt: new Date() },
            { id: 'c', type: 'OUTPUT', label: 'C', config: {}, createdAt: new Date() },
          ],
          edges: [
            { id: 'e1', sourceNodeId: 'a', targetNodeId: 'cond', sourceHandle: null, targetHandle: null },
            { id: 'e2', sourceNodeId: 'cond', targetNodeId: 'b', sourceHandle: 'true', targetHandle: null },
            { id: 'e3', sourceNodeId: 'cond', targetNodeId: 'c', sourceHandle: 'false', targetHandle: null },
          ],
        }),
      },
      execution: {
        create: jest.fn().mockResolvedValue({ id: 'exec-true' }),
        update: jest.fn().mockResolvedValue({ id: 'exec-true', status: ExecutionStatus.SUCCEEDED }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'exec-true', status: ExecutionStatus.SUCCEEDED, output: { success: true }, error: null,
          steps: [
            { id: 'step-a', nodeId: 'a', status: 'SUCCEEDED' },
            { id: 'step-cond', nodeId: 'cond', status: 'SUCCEEDED' },
            { id: 'step-b', nodeId: 'b', status: 'SUCCEEDED' },
            { id: 'step-c', nodeId: 'c', status: 'SKIPPED' },
          ],
          workflow: { id: 'workflow-true', name: 'True branch workflow' },
          workflowVersion: { id: 'version-true', version: 1, nodes: [], edges: [] },
        }),
      },
      executionStep: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: `step-${data.nodeId}`, executionId: data.executionId, nodeId: data.nodeId, status: 'RUNNING' })),
        update: jest.fn().mockImplementation(({ data, where }) => ({ id: where.id, nodeId: where.id.replace('step-', ''), ...data, status: data.status })),
      },
    } as any;

    const service = new ExecutionsService(prisma);
    const result = await service.runWorkflow('workflow-true', 'version-true', { priority: 'urgent' });

    expect(result.status).toBe(ExecutionStatus.SUCCEEDED);
    expect(prisma.executionStep.create.mock.calls.map((call) => call[0].data.nodeId)).toEqual(['a', 'cond', 'b', 'c']);
  });

  it('executes only the false branch for a condition node when condition evaluates false', async () => {
    const prisma = {
      workflowVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-false',
          workflowId: 'workflow-false',
          version: 1,
          nodes: [
            { id: 'a', type: 'MANUAL_TRIGGER', label: 'A', config: {}, createdAt: new Date() },
            { id: 'cond', type: 'CONDITION', label: 'Condition', config: { leftValue: '{{ input.priority }}', operator: 'equals', rightValue: 'urgent' }, createdAt: new Date() },
            { id: 'b', type: 'OUTPUT', label: 'B', config: {}, createdAt: new Date() },
            { id: 'c', type: 'OUTPUT', label: 'C', config: {}, createdAt: new Date() },
          ],
          edges: [
            { id: 'e1', sourceNodeId: 'a', targetNodeId: 'cond', sourceHandle: null, targetHandle: null },
            { id: 'e2', sourceNodeId: 'cond', targetNodeId: 'b', sourceHandle: 'true', targetHandle: null },
            { id: 'e3', sourceNodeId: 'cond', targetNodeId: 'c', sourceHandle: 'false', targetHandle: null },
          ],
        }),
      },
      execution: {
        create: jest.fn().mockResolvedValue({ id: 'exec-false' }),
        update: jest.fn().mockResolvedValue({ id: 'exec-false', status: ExecutionStatus.SUCCEEDED }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'exec-false', status: ExecutionStatus.SUCCEEDED, output: { success: true }, error: null,
          steps: [
            { id: 'step-a', nodeId: 'a', status: 'SUCCEEDED' },
            { id: 'step-cond', nodeId: 'cond', status: 'SUCCEEDED' },
            { id: 'step-b', nodeId: 'b', status: 'SKIPPED' },
            { id: 'step-c', nodeId: 'c', status: 'SUCCEEDED' },
          ],
          workflow: { id: 'workflow-false', name: 'False branch workflow' },
          workflowVersion: { id: 'version-false', version: 1, nodes: [], edges: [] },
        }),
      },
      executionStep: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: `step-${data.nodeId}`, executionId: data.executionId, nodeId: data.nodeId, status: 'RUNNING' })),
        update: jest.fn().mockImplementation(({ data, where }) => ({ id: where.id, nodeId: where.id.replace('step-', ''), ...data, status: data.status })),
      },
    } as any;

    const service = new ExecutionsService(prisma);
    const result = await service.runWorkflow('workflow-false', 'version-false', { priority: 'low' });

    expect(result.status).toBe(ExecutionStatus.SUCCEEDED);
    expect(prisma.executionStep.create.mock.calls.map((call) => call[0].data.nodeId)).toEqual(['a', 'cond', 'c', 'b']);
  });

  it('stops at a failed node and marks downstream nodes as skipped', async () => {
    const prisma = {
      workflowVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-failgraph',
          workflowId: 'workflow-failgraph',
          version: 1,
          nodes: [
            { id: 'a', type: 'MANUAL_TRIGGER', label: 'A', config: {}, createdAt: new Date() },
            { id: 'b', type: 'HTTP_REQUEST', label: 'B', config: { shouldFail: true }, createdAt: new Date() },
            { id: 'c', type: 'OUTPUT', label: 'C', config: {}, createdAt: new Date() },
          ],
          edges: [
            { id: 'e1', sourceNodeId: 'a', targetNodeId: 'b', sourceHandle: null, targetHandle: null },
            { id: 'e2', sourceNodeId: 'b', targetNodeId: 'c', sourceHandle: null, targetHandle: null },
          ],
        }),
      },
      execution: {
        create: jest.fn().mockResolvedValue({ id: 'exec-failgraph' }),
        update: jest.fn().mockResolvedValue({ id: 'exec-failgraph', status: ExecutionStatus.FAILED }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'exec-failgraph', status: ExecutionStatus.FAILED, output: { success: false, status: ExecutionStatus.FAILED }, error: 'Node "B" failed',
          steps: [
            { id: 'step-a', nodeId: 'a', status: 'SUCCEEDED' },
            { id: 'step-b', nodeId: 'b', status: 'FAILED' },
            { id: 'step-c', nodeId: 'c', status: 'SKIPPED' },
          ],
          workflow: { id: 'workflow-failgraph', name: 'Failure workflow' },
          workflowVersion: { id: 'version-failgraph', version: 1, nodes: [], edges: [] },
        }),
      },
      executionStep: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: `step-${data.nodeId}`, executionId: data.executionId, nodeId: data.nodeId, status: 'RUNNING' })),
        update: jest.fn().mockImplementation(({ data, where }) => ({ id: where.id, nodeId: where.id.replace('step-', ''), ...data, status: data.status })),
      },
    } as any;

    const service = new ExecutionsService(prisma);
    const result = await service.runWorkflow('workflow-failgraph', 'version-failgraph', {});

    expect(result.status).toBe(ExecutionStatus.FAILED);
    expect(result.steps.some((step) => step.status === 'FAILED')).toBe(true);
    expect(result.steps.some((step) => step.nodeId === 'c' && step.status === 'SKIPPED')).toBe(true);
  });

  it('rejects a cycle before any execution begins', async () => {
    const prisma = {
      workflowVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-cycle',
          workflowId: 'workflow-cycle',
          version: 1,
          nodes: [
            { id: 'a', type: 'MANUAL_TRIGGER', label: 'A', config: {}, createdAt: new Date() },
            { id: 'b', type: 'OUTPUT', label: 'B', config: {}, createdAt: new Date() },
            { id: 'c', type: 'OUTPUT', label: 'C', config: {}, createdAt: new Date() },
          ],
          edges: [
            { id: 'e1', sourceNodeId: 'a', targetNodeId: 'b', sourceHandle: null, targetHandle: null },
            { id: 'e2', sourceNodeId: 'b', targetNodeId: 'c', sourceHandle: null, targetHandle: null },
            { id: 'e3', sourceNodeId: 'c', targetNodeId: 'a', sourceHandle: null, targetHandle: null },
          ],
        }),
      },
      execution: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      executionStep: {
        create: jest.fn(),
        update: jest.fn(),
      },
    } as any;

    const service = new ExecutionsService(prisma);

    await expect(service.runWorkflow('workflow-cycle', 'version-cycle', {})).rejects.toThrow(/cycle|Cycle/i);
    expect(prisma.execution.create).not.toHaveBeenCalled();
  });
});
