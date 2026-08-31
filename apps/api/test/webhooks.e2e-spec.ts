import { randomBytes } from 'node:crypto';

process.env.APP_ENCRYPTION_KEY =
  process.env.APP_ENCRYPTION_KEY && process.env.APP_ENCRYPTION_KEY.trim() !== ''
    ? process.env.APP_ENCRYPTION_KEY
    : randomBytes(32).toString('base64');

import { ExecutionStepStatus } from '@prisma/client';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SlackNodeExecutor } from '../src/executions/executors/slack.executor';

/** Records what the Slack node was asked to send, without calling Slack. */
class RecordingSlackExecutor {
  calls: Array<{ message: unknown; channel: unknown; integrationId: unknown }> = [];
  async execute(node: { id: string; label: string }, resolvedConfig: Record<string, unknown>) {
    this.calls.push({
      message: resolvedConfig.message,
      channel: resolvedConfig.channel,
      integrationId: resolvedConfig.integrationId,
    });
    return {
      status: ExecutionStepStatus.SUCCEEDED,
      output: {
        nodeId: node.id,
        nodeType: 'SLACK',
        label: node.label,
        config: {
          integrationId: resolvedConfig.integrationId,
          channel: resolvedConfig.channel,
          message: resolvedConfig.message,
        },
        slack: { ok: true, ts: 'stub.ts' },
        status: 'SUCCEEDED',
      },
      error: null,
      branch: null,
    };
  }
}

function workspaceHeader(req: { headers: Record<string, unknown>; user?: unknown }, _res: unknown, next: () => void) {
  const ws = req.headers['x-test-workspace'];
  if (ws) req.user = { id: 'test-user', workspaceId: String(ws) };
  next();
}

describe('Webhooks (e2e, DB-backed, Slack stubbed)', () => {
  jest.setTimeout(40000);

  let app: INestApplication;
  const prisma = new PrismaService();
  const slack = new RecordingSlackExecutor();

  let wsA = '';
  let wsB = '';
  const workflowIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    wsA = (await prisma.workspace.create({ data: { name: 'wh A', slug: `wh-a-${Date.now()}` } })).id;
    wsB = (await prisma.workspace.create({ data: { name: 'wh B', slug: `wh-b-${Date.now()}` } })).id;

    const ref = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SlackNodeExecutor)
      .useValue(slack)
      .compile();
    app = ref.createNestApplication();
    app.use(workspaceHeader);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const id of workflowIds) await prisma.workflow.deleteMany({ where: { id } });
    await prisma.variable.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  async function makeWebhookWorkflow(
    ws: string,
    message: string,
  ): Promise<{ workflowId: string; secret: string }> {
    const wf = await prisma.workflow.create({ data: { name: 'wh-e2e' } });
    workflowIds.push(wf.id);
    const version = await prisma.workflowVersion.create({
      data: { workflowId: wf.id, version: 1, isPublished: true },
    });
    const trigger = await prisma.node.create({
      data: { workflowVersionId: version.id, type: 'WEBHOOK', label: 'Hook', positionX: 0, positionY: 0, config: {} },
    });
    const slackNode = await prisma.node.create({
      data: {
        workflowVersionId: version.id,
        type: 'SLACK',
        label: 'Slack',
        positionX: 200,
        positionY: 0,
        config: { integrationId: 'int-x', channel: '#c', message },
      },
    });
    await prisma.edge.create({
      data: { workflowVersionId: version.id, sourceNodeId: trigger.id, targetNodeId: slackNode.id },
    });

    const rotate = await http()
      .post(`/webhooks/${wf.id}/rotate`)
      .set('x-test-workspace', ws)
      .expect(201);
    return { workflowId: wf.id, secret: rotate.body.secret as string };
  }

  beforeEach(() => {
    slack.calls = [];
  });

  it('14-19,22. real HTTP webhook creates an execution and the Slack node gets the resolved message', async () => {
    const { workflowId, secret } = await makeWebhookWorkflow(wsA, 'Hello {{ input.name }}');

    const res = await http()
      .post(`/webhooks/${workflowId}`)
      .set('x-webhook-secret', secret)
      .set('content-type', 'application/json')
      .send({ name: 'Hrithik' })
      .expect(201);

    expect(res.body.accepted).toBe(true);
    expect(res.body.status).toBe('SUCCEEDED');
    expect(res.body.executionId).toEqual(expect.any(String));

    expect(slack.calls).toHaveLength(1);
    expect(slack.calls[0].message).toBe('Hello Hrithik');

    // 17. execution persisted with WEBHOOK trigger
    const exec = await prisma.execution.findUnique({ where: { id: res.body.executionId } });
    expect(exec?.triggerType).toBe('WEBHOOK');
    expect(exec?.input).toEqual({ name: 'Hrithik' });

    // 22. persisted graph still contains the template
    const node = await prisma.node.findFirst({
      where: { workflowVersion: { workflowId }, type: 'SLACK' },
    });
    expect(JSON.stringify(node?.config)).toContain('{{ input.name }}');
    expect(JSON.stringify(node?.config)).not.toContain('Hrithik');

    // no secret anywhere in the response
    expect(JSON.stringify(res.body)).not.toContain(secret);
  });

  it('21. a second payload produces a different resolved message, graph unchanged', async () => {
    const { workflowId, secret } = await makeWebhookWorkflow(wsA, 'Hi {{ input.name }}');

    await http().post(`/webhooks/${workflowId}`).set('x-webhook-secret', secret).send({ name: 'Hrithik' }).expect(201);
    await http().post(`/webhooks/${workflowId}`).set('x-webhook-secret', secret).send({ name: 'Rahul' }).expect(201);

    expect(slack.calls.map((c) => c.message)).toEqual(['Hi Hrithik', 'Hi Rahul']);

    const node = await prisma.node.findFirst({
      where: { workflowVersion: { workflowId }, type: 'SLACK' },
    });
    expect(JSON.stringify(node?.config)).toContain('{{ input.name }}');
  });

  it('11. webhook input + workspace variable resolve together', async () => {
    await prisma.variable.create({
      data: { workspaceId: wsA, name: 'company', value: 'AI Workflow Studio', type: 'String', environment: 'Production' },
    });
    const { workflowId, secret } = await makeWebhookWorkflow(
      wsA,
      'Hello {{ input.name }} from {{ company }}',
    );

    await http().post(`/webhooks/${workflowId}`).set('x-webhook-secret', secret).send({ name: 'Hrithik' }).expect(201);
    expect(slack.calls[0].message).toBe('Hello Hrithik from AI Workflow Studio');
  });

  it('12,25. missing input fails deterministically, no Slack call', async () => {
    const { workflowId, secret } = await makeWebhookWorkflow(wsA, 'Hello {{ input.name }}');

    const res = await http()
      .post(`/webhooks/${workflowId}`)
      .set('x-webhook-secret', secret)
      .send({})
      .expect(201);

    expect(res.body.status).toBe('FAILED');
    expect(slack.calls).toHaveLength(0);

    const exec = await prisma.execution.findUnique({ where: { id: res.body.executionId } });
    const step = await prisma.executionStep.findFirst({
      where: { executionId: exec!.id, status: 'FAILED' },
    });
    expect((step?.output as { code?: string })?.code).toBe('VARIABLE_NOT_FOUND');
  });

  it('4,24. invalid secret -> 401, no execution, no Slack', async () => {
    const { workflowId } = await makeWebhookWorkflow(wsA, 'Hello {{ input.name }}');
    const before = await prisma.execution.count({ where: { workflowId } });

    await http()
      .post(`/webhooks/${workflowId}`)
      .set('x-webhook-secret', 'not-the-secret')
      .send({ name: 'x' })
      .expect(401);

    expect(slack.calls).toHaveLength(0);
    expect(await prisma.execution.count({ where: { workflowId } })).toBe(before);
  });

  it('unknown workflow -> opaque 404', async () => {
    const res = await http()
      .post('/webhooks/00000000-0000-0000-0000-000000000000')
      .set('x-webhook-secret', 'whatever')
      .send({})
      .expect(404);
    expect(JSON.stringify(res.body)).not.toMatch(/workspace|version|node/i);
  });

  it('8. disabled webhook -> 403, no execution', async () => {
    const { workflowId, secret } = await makeWebhookWorkflow(wsA, 'x {{ input.name }}');
    await http()
      .patch(`/webhooks/${workflowId}`)
      .set('x-test-workspace', wsA)
      .send({ enabled: false })
      .expect(200);

    await http().post(`/webhooks/${workflowId}`).set('x-webhook-secret', secret).send({ name: 'x' }).expect(403);
    expect(slack.calls).toHaveLength(0);
  });

  it('7. unsupported content type -> 415', async () => {
    const { workflowId, secret } = await makeWebhookWorkflow(wsA, 'x {{ input.name }}');
    await http()
      .post(`/webhooks/${workflowId}`)
      .set('x-webhook-secret', secret)
      .set('content-type', 'text/plain')
      .send('name=Hrithik')
      .expect(415);
  });

  it('23. workspace isolation: wsB user cannot read/rotate wsA webhook', async () => {
    const { workflowId } = await makeWebhookWorkflow(wsA, 'x {{ input.name }}');
    await http().get(`/webhooks/${workflowId}`).set('x-test-workspace', wsB).expect(404);
    await http().post(`/webhooks/${workflowId}/rotate`).set('x-test-workspace', wsB).expect(404);
  });

  it('GET config never returns the secret', async () => {
    const { workflowId } = await makeWebhookWorkflow(wsA, 'x {{ input.name }}');
    const res = await http().get(`/webhooks/${workflowId}`).set('x-test-workspace', wsA).expect(200);
    expect(res.body).toMatchObject({ enabled: true, hasSecret: true, path: `/webhooks/${workflowId}` });
    expect('secret' in res.body).toBe(false);
  });

  it('config routes require an authenticated workspace', async () => {
    const { workflowId } = await makeWebhookWorkflow(wsA, 'x {{ input.name }}');
    await http().get(`/webhooks/${workflowId}`).expect(401);
    await http().post(`/webhooks/${workflowId}/rotate`).expect(401);
  });

  it('26. manual execution still works (regression)', async () => {
    const wf = await prisma.workflow.create({ data: { name: 'manual-regression' } });
    workflowIds.push(wf.id);
    const version = await prisma.workflowVersion.create({ data: { workflowId: wf.id, version: 1 } });
    await prisma.node.create({
      data: { workflowVersionId: version.id, type: 'MANUAL_TRIGGER', label: 'T', positionX: 0, positionY: 0, config: {} },
    });
    const out = await prisma.node.create({
      data: { workflowVersionId: version.id, type: 'OUTPUT', label: 'O', positionX: 100, positionY: 0, config: { v: 'static' } },
    });
    await prisma.edge.create({
      data: { workflowVersionId: version.id, sourceNodeId: (await prisma.node.findFirst({ where: { workflowVersionId: version.id, type: 'MANUAL_TRIGGER' } }))!.id, targetNodeId: out.id },
    });

    const res = await http()
      .post('/executions/run')
      .set('x-test-workspace', wsA)
      .send({ workflowId: wf.id, workflowVersionId: version.id, triggerType: 'MANUAL' })
      .expect(201);
    expect(res.body.status).toBe('SUCCEEDED');
    expect(res.body.triggerType).toBe('MANUAL');
  });
});
