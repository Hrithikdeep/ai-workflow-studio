import { PrismaService } from '../prisma/prisma.service';
import { ExecutionsService } from './executions.service';
import { ExecutionStatus } from '@prisma/client';

describe('ExecutionsService (E2E) - UI-triggered DB variable load', () => {
  jest.setTimeout(20000);

  it('resolves DB variables when no variables payload is passed (UI run)', async () => {
    const prisma = new PrismaService();
    await prisma.$connect();

    try {
      // create test variables in the DB (simulate variables created via Variables UI)
      // create variables in a test-scoped environment to avoid touching Production data
      await prisma.variable.create({ data: { name: 'TEST_NUMBER', value: '42', type: 'Number', environment: 'test-e2e-ui' } });
      await prisma.variable.create({ data: { name: 'TEST_BOOL', value: 'true', type: 'Boolean', environment: 'test-e2e-ui' } });
      await prisma.variable.create({ data: { name: 'test', value: 'hello', type: 'String', environment: 'test-e2e-ui' } });

      // create workflow and nodes
      const workflow = await prisma.workflow.create({ data: { name: 'e2e-ui-vars-workflow' } });
      const version = await prisma.workflowVersion.create({ data: { workflowId: workflow.id, version: 1 } });

      const nodeA = await prisma.node.create({
        data: {
          workflowVersionId: version.id,
          type: 'MANUAL_TRIGGER',
          label: 'A',
          positionX: 0,
          positionY: 0,
          config: { valNumber: '{{ vars.TEST_NUMBER }}', valBool: '{{ vars.TEST_BOOL }}', valString: '{{ vars.test }}' },
        },
      });

      const nodeB = await prisma.node.create({
        data: {
          workflowVersionId: version.id,
          type: 'OUTPUT',
          label: 'B',
          positionX: 100,
          positionY: 0,
          config: {
            outNumber: '{{ previous.output.config.valNumber }}',
            outBool: '{{ previous.output.config.valBool }}',
            outString: '{{ previous.output.config.valString }}',
          },
        },
      });

      await prisma.edge.create({ data: { workflowVersionId: version.id, sourceNodeId: nodeA.id, targetNodeId: nodeB.id } });

      const service = new ExecutionsService(prisma as any);
      // UI-triggered run does NOT pass a variables object
      const result = await service.runWorkflow(workflow.id, version.id, {}, 'MANUAL');

      expect(result.status).toBe(ExecutionStatus.SUCCEEDED);
      const stepB = result.steps.find((s: any) => s.nodeId === nodeB.id);
      expect(stepB).toBeDefined();
      const outB = (stepB!.output as any).config;
      expect(outB.outNumber).toBe(42);
      expect(outB.outBool).toBe(true);
      expect(outB.outString).toBe('hello');

      // cleanup
      await prisma.workflow.delete({ where: { id: workflow.id } });
      await prisma.variable.deleteMany({ where: { environment: 'test-e2e-ui' } });
    } finally {
      await prisma.$disconnect();
    }
  });
});
