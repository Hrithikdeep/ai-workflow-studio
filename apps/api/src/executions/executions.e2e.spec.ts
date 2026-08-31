import { PrismaService } from '../prisma/prisma.service';
import { ExecutionsService } from './executions.service';
import { ExecutionStatus } from '@prisma/client';

describe('ExecutionsService (E2E) - DB-backed variables', () => {
  jest.setTimeout(20000);

  it('resolves DB variables and previous.output mapping using the real database', async () => {
    const prisma = new PrismaService();
    await prisma.$connect();

    // create test variables in the DB
    const createdVars: Array<any> = [];
    try {
      createdVars.push(
        await prisma.variable.create({ data: { name: 'TEST_NUMBER', value: '42', type: 'Number', environment: 'test' } }),
      );
      createdVars.push(
        await prisma.variable.create({ data: { name: 'TEST_BOOL', value: 'true', type: 'Boolean', environment: 'test' } }),
      );
      createdVars.push(
        await prisma.variable.create({ data: { name: 'test', value: 'hello', type: 'String', environment: 'test' } }),
      );

      // create a workflow, version, two nodes and an edge between them
      const workflow = await prisma.workflow.create({ data: { name: 'e2e-vars-workflow' } });
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

      // build variables map from DB (convert types)
      const dbVars = await prisma.variable.findMany({ where: { environment: 'test' } });
      const varsMap: Record<string, unknown> = {};
      for (const v of dbVars) {
        switch (v.type) {
          case 'Number':
            varsMap[v.name] = Number(v.value);
            break;
          case 'Boolean':
            varsMap[v.name] = v.value === 'true';
            break;
          default:
            varsMap[v.name] = v.value;
        }
      }

      const service = new ExecutionsService(prisma as any);
      const result = await service.runWorkflow(workflow.id, version.id, {}, 'MANUAL', varsMap);

      expect(result.status).toBe(ExecutionStatus.SUCCEEDED);

      const stepB = result.steps.find((s: any) => s.nodeId === nodeB.id);
      expect(stepB).toBeDefined();
      expect(stepB!.output).toBeDefined();
      const outB = (stepB!.output as any).config;
      expect(outB).toBeDefined();
      expect(outB.outNumber).toBe(42);
      expect(outB.outBool).toBe(true);
      expect(outB.outString).toBe('hello');

      // cleanup
      await prisma.workflow.delete({ where: { id: workflow.id } });
      await prisma.variable.deleteMany({ where: { environment: 'test' } });
    } finally {
      await prisma.$disconnect();
    }
  });
});
