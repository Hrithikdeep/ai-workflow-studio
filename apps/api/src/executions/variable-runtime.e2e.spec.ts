import { randomBytes } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { ExecutionsService } from './executions.service';
import { ExecutionStatus, ExecutionStepStatus } from '@prisma/client';

/**
 * DB-backed proof that variable resolution at runtime is real and
 * workspace-scoped. Uses OUTPUT nodes that echo their resolved config so
 * assertions see exactly what an executor would receive.
 */
describe('Variable runtime resolution (E2E, DB-backed)', () => {
  jest.setTimeout(30000);

  const prisma = new PrismaService();
  const service = new ExecutionsService(prisma);

  let wsA = '';
  let wsB = '';
  const cleanupWorkflowIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    wsA = (
      await prisma.workspace.create({
        data: { name: 'var A', slug: `var-a-${Date.now()}-${randomBytes(3).toString('hex')}` },
      })
    ).id;
    wsB = (
      await prisma.workspace.create({
        data: { name: 'var B', slug: `var-b-${Date.now()}-${randomBytes(3).toString('hex')}` },
      })
    ).id;
  });

  afterAll(async () => {
    for (const id of cleanupWorkflowIds) {
      await prisma.workflow.deleteMany({ where: { id } });
    }
    await prisma.variable.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
    await prisma.$disconnect();
  });

  async function makeWorkflow(config: Record<string, unknown>) {
    const wf = await prisma.workflow.create({ data: { name: 'var-e2e' } });
    cleanupWorkflowIds.push(wf.id);
    const version = await prisma.workflowVersion.create({
      data: { workflowId: wf.id, version: 1 },
    });
    const trigger = await prisma.node.create({
      data: {
        workflowVersionId: version.id,
        type: 'MANUAL_TRIGGER',
        label: 'T',
        positionX: 0,
        positionY: 0,
        config: {},
      },
    });
    const out = await prisma.node.create({
      data: {
        workflowVersionId: version.id,
        type: 'OUTPUT',
        label: 'O',
        positionX: 200,
        positionY: 0,
        config: config as never,
      },
    });
    await prisma.edge.create({
      data: {
        workflowVersionId: version.id,
        sourceNodeId: trigger.id,
        targetNodeId: out.id,
      },
    });
    return { workflowId: wf.id, versionId: version.id, outNodeId: out.id };
  }

  function outputConfig(result: Awaited<ReturnType<ExecutionsService['runWorkflow']>>, nodeId: string) {
    const step = result.steps.find((s) => s.nodeId === nodeId);
    return (step?.output as { config?: Record<string, unknown> })?.config;
  }

  it('resolves a workspace-scoped variable at runtime (types preserved)', async () => {
    await prisma.variable.create({
      data: { workspaceId: wsA, name: 'name', value: 'Hrithik', type: 'String', environment: 'Production' },
    });
    await prisma.variable.create({
      data: { workspaceId: wsA, name: 'score', value: '95', type: 'Number', environment: 'Production' },
    });

    const { workflowId, versionId, outNodeId } = await makeWorkflow({
      message: 'Hello {{ name }}, score={{ score }}',
      raw: '{{ score }}',
      nested: { who: '{{ name }}' },
      list: ['{{ name }}'],
    });

    const result = await service.runWorkflow(workflowId, versionId, {}, 'MANUAL', {}, wsA);
    expect(result.status).toBe(ExecutionStatus.SUCCEEDED);

    const cfg = outputConfig(result, outNodeId)!;
    expect(cfg.message).toBe('Hello Hrithik, score=95');
    expect(cfg.raw).toBe(95); // whole-field: number preserved
    expect(cfg.nested).toEqual({ who: 'Hrithik' });
    expect(cfg.list).toEqual(['Hrithik']);

    // persisted workflow graph still contains the template, not the value
    const persisted = await prisma.node.findUnique({ where: { id: outNodeId } });
    expect(JSON.stringify(persisted!.config)).toContain('{{ name }}');
    expect(JSON.stringify(persisted!.config)).not.toContain('Hrithik');
  });

  it('reflects a variable change on the next execution without touching the graph', async () => {
    await prisma.variable.deleteMany({ where: { workspaceId: wsA, name: 'greet' } });
    await prisma.variable.create({
      data: { workspaceId: wsA, name: 'greet', value: 'Hrithik', type: 'String', environment: 'Production' },
    });
    const { workflowId, versionId, outNodeId } = await makeWorkflow({
      message: 'Hello {{ greet }}',
    });

    const first = await service.runWorkflow(workflowId, versionId, {}, 'MANUAL', {}, wsA);
    expect(outputConfig(first, outNodeId)!.message).toBe('Hello Hrithik');

    await prisma.variable.updateMany({
      where: { workspaceId: wsA, name: 'greet' },
      data: { value: 'Rahul' },
    });

    const second = await service.runWorkflow(workflowId, versionId, {}, 'MANUAL', {}, wsA);
    expect(outputConfig(second, outNodeId)!.message).toBe('Hello Rahul');

    const persisted = await prisma.node.findUnique({ where: { id: outNodeId } });
    expect(JSON.stringify(persisted!.config)).toContain('{{ greet }}');
  });

  it('isolates variables across workspaces', async () => {
    await prisma.variable.create({
      data: { workspaceId: wsA, name: 'ws_name', value: 'A', type: 'String', environment: 'Production' },
    });
    await prisma.variable.create({
      data: { workspaceId: wsB, name: 'ws_name', value: 'B', type: 'String', environment: 'Production' },
    });

    const a = await makeWorkflow({ message: '{{ ws_name }}' });
    const b = await makeWorkflow({ message: '{{ ws_name }}' });

    const ra = await service.runWorkflow(a.workflowId, a.versionId, {}, 'MANUAL', {}, wsA);
    const rb = await service.runWorkflow(b.workflowId, b.versionId, {}, 'MANUAL', {}, wsB);

    expect(outputConfig(ra, a.outNodeId)!.message).toBe('A');
    expect(outputConfig(rb, b.outNodeId)!.message).toBe('B');
    // A must never see B's value
    expect(JSON.stringify(ra)).not.toContain('"message":"B"');
  });

  it('fails deterministically with VARIABLE_NOT_FOUND for a missing variable', async () => {
    const { workflowId, versionId, outNodeId } = await makeWorkflow({
      message: 'Hello {{ missing_variable }}',
    });

    const result = await service.runWorkflow(workflowId, versionId, {}, 'MANUAL', {}, wsA);

    expect(result.status).toBe(ExecutionStatus.FAILED);
    const step = result.steps.find((s) => s.nodeId === outNodeId);
    expect(step?.status).toBe(ExecutionStepStatus.FAILED);
    expect((step?.output as { code?: string })?.code).toBe('VARIABLE_NOT_FOUND');
    expect(step?.error).toBe('Missing workflow variable "missing_variable".');
    // the failure message names only the missing key, never any value
    expect(step?.error).not.toMatch(/Hrithik|Rahul|95|hello/);
    expect(result.error).not.toMatch(/Hrithik|Rahul|95|hello/);
  });

  it('still works with a static message (no variables)', async () => {
    const { workflowId, versionId, outNodeId } = await makeWorkflow({
      message: 'Static message',
    });
    const result = await service.runWorkflow(workflowId, versionId, {}, 'MANUAL', {}, wsA);
    expect(result.status).toBe(ExecutionStatus.SUCCEEDED);
    expect(outputConfig(result, outNodeId)!.message).toBe('Static message');
  });

  it('does not load another workspace when workspaceId is provided', async () => {
    // wsB has `ws_name = B`; a wsA run referencing it must fail, not leak "B"
    const { workflowId, versionId } = await makeWorkflow({ message: '{{ only_in_b }}' });
    await prisma.variable.create({
      data: { workspaceId: wsB, name: 'only_in_b', value: 'B-SECRET', type: 'String', environment: 'Production' },
    });

    const result = await service.runWorkflow(workflowId, versionId, {}, 'MANUAL', {}, wsA);
    expect(result.status).toBe(ExecutionStatus.FAILED);
    expect(JSON.stringify(result)).not.toContain('B-SECRET');
  });
});
