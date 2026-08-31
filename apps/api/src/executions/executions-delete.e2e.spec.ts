import { randomBytes } from 'node:crypto';

import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ExecutionsService } from './executions.service';

/**
 * DB-backed: deleting an execution removes only that execution and its steps.
 * Everything else — the workflow, its version, its nodes, and every other
 * execution — is left intact.
 */
describe('ExecutionsService.remove (E2E, DB-backed)', () => {
  jest.setTimeout(20000);

  const prisma = new PrismaService();
  const service = new ExecutionsService(prisma as never);

  let workflowId = '';
  let versionId = '';
  let nodeId = '';
  let execAId = '';
  let execBId = '';

  beforeAll(async () => {
    await prisma.$connect();

    const wf = await prisma.workflow.create({
      data: { name: `del-e2e-${randomBytes(3).toString('hex')}` },
    });
    workflowId = wf.id;

    const version = await prisma.workflowVersion.create({
      data: { workflowId, version: 1 },
    });
    versionId = version.id;

    const node = await prisma.node.create({
      data: {
        workflowVersionId: versionId,
        type: 'MANUAL_TRIGGER',
        label: 'Start',
        positionX: 0,
        positionY: 0,
        config: {},
      },
    });
    nodeId = node.id;

    const mkExec = async () => {
      const exec = await prisma.execution.create({
        data: {
          workflowId,
          workflowVersionId: versionId,
          status: 'SUCCEEDED',
          triggerType: 'MANUAL',
        },
      });
      await prisma.executionStep.create({
        data: {
          executionId: exec.id,
          nodeId,
          status: 'SUCCEEDED',
          output: { ok: true },
        },
      });
      return exec.id;
    };

    execAId = await mkExec();
    execBId = await mkExec();
  });

  afterAll(async () => {
    await prisma.execution.deleteMany({ where: { workflowId } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.$disconnect();
  });

  it('deletes the execution and cascades its steps, leaving everything else intact', async () => {
    const stepsBefore = await prisma.executionStep.count({
      where: { executionId: execAId },
    });
    expect(stepsBefore).toBe(1);

    const result = await service.remove(execAId);
    expect(result).toEqual({ id: execAId, deleted: true });

    // execution A + its steps are gone
    expect(
      await prisma.execution.findUnique({ where: { id: execAId } }),
    ).toBeNull();
    expect(
      await prisma.executionStep.count({ where: { executionId: execAId } }),
    ).toBe(0);

    // execution B + its step are untouched
    expect(
      await prisma.execution.findUnique({ where: { id: execBId } }),
    ).not.toBeNull();
    expect(
      await prisma.executionStep.count({ where: { executionId: execBId } }),
    ).toBe(1);

    // workflow, version and node are untouched
    expect(
      await prisma.workflow.findUnique({ where: { id: workflowId } }),
    ).not.toBeNull();
    expect(
      await prisma.workflowVersion.findUnique({ where: { id: versionId } }),
    ).not.toBeNull();
    expect(
      await prisma.node.findUnique({ where: { id: nodeId } }),
    ).not.toBeNull();
  });

  it('throws NotFound for an unknown / already-deleted execution id', async () => {
    await expect(service.remove(execAId)).rejects.toThrow(NotFoundException);
    await expect(
      service.remove('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(NotFoundException);
  });
});
