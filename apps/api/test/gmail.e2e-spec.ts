import { randomBytes } from 'node:crypto';

process.env.APP_ENCRYPTION_KEY =
  process.env.APP_ENCRYPTION_KEY && process.env.APP_ENCRYPTION_KEY.trim() !== ''
    ? process.env.APP_ENCRYPTION_KEY
    : randomBytes(32).toString('base64');
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI =
  'http://localhost:3001/integrations/gmail/oauth/callback';
process.env.WEB_APP_URL = 'http://localhost:3000';

import { INestApplication } from '@nestjs/common';
import { ExecutionStepStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GmailClient } from '../src/integrations/gmail/gmail-client';

const ACCESS = 'ya29.E2E-ACCESS';
const REFRESH = '1//E2E-REFRESH';

/** Stub of the Google/Gmail HTTP boundary. */
class StubGmailClient {
  sent: Array<{ token: string; mime: string }> = [];
  buildAuthorizationUrl = new GmailClient().buildAuthorizationUrl;
  buildRawMessage = new GmailClient().buildRawMessage;
  async exchangeCode() {
    return {
      accessToken: ACCESS,
      refreshToken: REFRESH,
      accessTokenExpiresAt: Date.now() + 3600_000,
      scope: 'https://www.googleapis.com/auth/gmail.send openid email',
    };
  }
  async refreshAccessToken() {
    return { accessToken: ACCESS, accessTokenExpiresAt: Date.now() + 3600_000, scope: 's' };
  }
  async getProfile() {
    return { email: 'e2e-bot@example.com' };
  }
  async sendMessage(token: string, raw: string) {
    this.sent.push({ token, mime: Buffer.from(raw, 'base64url').toString('utf8') });
    return { id: 'gmail-msg-e2e', threadId: 'gmail-thr-e2e' };
  }
}

function workspaceHeader(req: { headers: Record<string, unknown>; user?: unknown }, _r: unknown, next: () => void) {
  const ws = req.headers['x-test-workspace'];
  const uid = req.headers['x-test-user'];
  if (ws) req.user = { id: uid ? String(uid) : 'test-user', workspaceId: String(ws) };
  next();
}

describe('Gmail OAuth + executor (e2e, DB-backed, Google stubbed)', () => {
  jest.setTimeout(40000);
  let app: INestApplication;
  const prisma = new PrismaService();
  const gmail = new StubGmailClient();
  let wsA = '';
  let wsB = '';
  const workflowIds: string[] = [];
  const integrationIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    wsA = (await prisma.workspace.create({ data: { name: 'gm A', slug: `gm-a-${Date.now()}` } })).id;
    wsB = (await prisma.workspace.create({ data: { name: 'gm B', slug: `gm-b-${Date.now()}` } })).id;

    const ref = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GmailClient)
      .useValue(gmail)
      .compile();
    app = ref.createNestApplication();
    app.use(workspaceHeader);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const id of workflowIds) await prisma.workflow.deleteMany({ where: { id } });
    await prisma.oAuthState.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await prisma.integrationCredential.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await prisma.integration.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    gmail.sent = [];
  });

  const http = () => request(app.getHttpServer());

  it('1. OAuth start requires an authenticated workspace', async () => {
    await http().get('/integrations/gmail/oauth/start').expect(401);
  });

  it('2. OAuth start redirects to Google and persists a workspace-bound state', async () => {
    const res = await http()
      .get('/integrations/gmail/oauth/start')
      .set('x-test-workspace', wsA)
      .set('x-test-user', 'user-A')
      .expect(302);

    const location = res.headers.location as string;
    expect(location.startsWith('https://accounts.google.com/o/oauth2/v2/auth')).toBe(true);
    const state = new URL(location).searchParams.get('state')!;
    const row = await prisma.oAuthState.findUnique({ where: { state } });
    expect(row?.workspaceId).toBe(wsA);
    expect(row?.userId).toBe('user-A');
    expect(row?.usedAt).toBeNull();
  });

  it('8/10/11. callback stores an ENCRYPTED credential in the state\'s workspace; no plaintext token in config or API', async () => {
    // start (as wsA)
    const start = await http()
      .get('/integrations/gmail/oauth/start')
      .set('x-test-workspace', wsA)
      .expect(302);
    const state = new URL(start.headers.location as string).searchParams.get('state')!;

    // callback (unauthenticated — resolved purely by state)
    const cb = await http()
      .get('/integrations/gmail/oauth/callback')
      .query({ code: 'the-auth-code', state })
      .expect(302);
    expect(cb.headers.location).toContain('gmail=connected');
    const integrationId = new URL(cb.headers.location as string).searchParams.get('integrationId')!;
    integrationIds.push(integrationId);

    const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
    expect(integration?.workspaceId).toBe(wsA); // workspace from state, not request
    expect(integration?.status).toBe('connected');
    expect(JSON.stringify(integration?.config)).not.toContain(REFRESH);
    expect(JSON.stringify(integration?.config)).not.toContain(ACCESS);

    const cred = await prisma.integrationCredential.findFirst({
      where: { workspaceId: wsA, integrationId },
    });
    expect(cred?.data).toMatch(/^v1:/); // encrypted blob
    expect(cred?.data).not.toContain(REFRESH);
    expect(cred?.data).not.toContain(ACCESS);

    // 12. API list never exposes the token
    const list = await http().get('/integrations').set('x-test-workspace', wsA).expect(200);
    const s = JSON.stringify(list.body);
    expect(s).not.toContain(REFRESH);
    expect(s).not.toContain(ACCESS);
    expect(s).not.toMatch(/refreshToken|accessToken/);
    const gmailRow = list.body.find((i: { id: string }) => i.id === integrationId);
    expect(gmailRow.hasCredential).toBe(true);
  });

  it('5/7. state is single-use — replaying the callback fails safely', async () => {
    const start = await http().get('/integrations/gmail/oauth/start').set('x-test-workspace', wsA).expect(302);
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    await http().get('/integrations/gmail/oauth/callback').query({ code: 'c', state }).expect(302);
    const replay = await http().get('/integrations/gmail/oauth/callback').query({ code: 'c', state }).expect(302);
    expect(replay.headers.location).toContain('reason=invalid_state');
  });

  it('6. unknown state fails safely', async () => {
    const res = await http()
      .get('/integrations/gmail/oauth/callback')
      .query({ code: 'c', state: 'not-a-real-state' })
      .expect(302);
    expect(res.headers.location).toContain('gmail=error');
  });

  it('13. Gmail connection test performs a real (stubbed) Google call', async () => {
    const start = await http().get('/integrations/gmail/oauth/start').set('x-test-workspace', wsA).expect(302);
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const cb = await http().get('/integrations/gmail/oauth/callback').query({ code: 'c', state }).expect(302);
    const integrationId = new URL(cb.headers.location as string).searchParams.get('integrationId')!;

    const test = await http()
      .post(`/integrations/${integrationId}/test`)
      .set('x-test-workspace', wsA)
      .send({})
      .expect(201);
    expect(test.body.ok).toBe(true);
    expect(test.body.code).toBe('OK');
    expect(JSON.stringify(test.body)).not.toContain(ACCESS);
  });

  it('17/22/24. GMAIL workflow node sends via Gmail, token absent from execution record', async () => {
    // connect gmail for wsA
    const start = await http().get('/integrations/gmail/oauth/start').set('x-test-workspace', wsA).expect(302);
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const cb = await http().get('/integrations/gmail/oauth/callback').query({ code: 'c', state }).expect(302);
    const integrationId = new URL(cb.headers.location as string).searchParams.get('integrationId')!;

    // build MANUAL_TRIGGER -> GMAIL workflow
    const wf = await prisma.workflow.create({ data: { name: 'gm-node' } });
    workflowIds.push(wf.id);
    const version = await prisma.workflowVersion.create({ data: { workflowId: wf.id, version: 1 } });
    const t = await prisma.node.create({
      data: { workflowVersionId: version.id, type: 'MANUAL_TRIGGER', label: 'T', positionX: 0, positionY: 0, config: {} },
    });
    const g = await prisma.node.create({
      data: {
        workflowVersionId: version.id, type: 'GMAIL', label: 'Gmail', positionX: 200, positionY: 0,
        config: { integrationId, to: '{{ input.email }}', subject: 'Welcome {{ name }}', body: 'Hello {{ name }}' },
      },
    });
    await prisma.edge.create({ data: { workflowVersionId: version.id, sourceNodeId: t.id, targetNodeId: g.id } });
    await prisma.variable.create({
      data: { workspaceId: wsA, name: 'name', value: 'Hrithik', type: 'String', environment: 'Production' },
    });

    const run = await http()
      .post('/executions/run')
      .set('x-test-workspace', wsA)
      .send({ workflowId: wf.id, workflowVersionId: version.id, triggerType: 'MANUAL', input: { email: 'to@example.com' } })
      .expect(201);

    expect(run.body.status).toBe('SUCCEEDED');
    const step = run.body.steps.find((s: { node?: { type?: string } }) => s.node?.type === 'GMAIL');
    expect(step.status).toBe(ExecutionStepStatus.SUCCEEDED);
    expect(step.output.gmail.id).toBe('gmail-msg-e2e');

    // the executor got resolved values
    expect(gmail.sent).toHaveLength(1);
    expect(gmail.sent[0].token).toBe(ACCESS);
    expect(gmail.sent[0].mime).toContain('To: to@example.com');
    expect(gmail.sent[0].mime).toContain('Subject: Welcome Hrithik');
    expect(gmail.sent[0].mime).toContain('Hello Hrithik');

    // 24. no token in the persisted execution
    const persisted = await prisma.execution.findUnique({
      where: { id: run.body.executionId ?? run.body.id },
      include: { steps: true },
    });
    const blob = JSON.stringify(persisted);
    expect(blob).not.toContain(ACCESS);
    expect(blob).not.toContain(REFRESH);
    expect(blob).not.toMatch(/ya29|Bearer /);

    // graph unchanged
    const node = await prisma.node.findUnique({ where: { id: g.id } });
    expect(JSON.stringify(node?.config)).toContain('{{ name }}');
  });

  it('17. Gmail node in wsB cannot use wsA\'s integration', async () => {
    // wsA connects gmail
    const start = await http().get('/integrations/gmail/oauth/start').set('x-test-workspace', wsA).expect(302);
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const cb = await http().get('/integrations/gmail/oauth/callback').query({ code: 'c', state }).expect(302);
    const wsAIntegrationId = new URL(cb.headers.location as string).searchParams.get('integrationId')!;

    const wf = await prisma.workflow.create({ data: { name: 'gm-foreign' } });
    workflowIds.push(wf.id);
    const version = await prisma.workflowVersion.create({ data: { workflowId: wf.id, version: 1 } });
    const t = await prisma.node.create({
      data: { workflowVersionId: version.id, type: 'MANUAL_TRIGGER', label: 'T', positionX: 0, positionY: 0, config: {} },
    });
    const g = await prisma.node.create({
      data: {
        workflowVersionId: version.id, type: 'GMAIL', label: 'Gmail', positionX: 200, positionY: 0,
        config: { integrationId: wsAIntegrationId, to: 'x@example.com', subject: 'S', body: 'B' },
      },
    });
    await prisma.edge.create({ data: { workflowVersionId: version.id, sourceNodeId: t.id, targetNodeId: g.id } });

    const run = await http()
      .post('/executions/run')
      .set('x-test-workspace', wsB) // running as workspace B
      .send({ workflowId: wf.id, workflowVersionId: version.id, triggerType: 'MANUAL' })
      .expect(201);

    const step = run.body.steps.find((s: { node?: { type?: string } }) => s.node?.type === 'GMAIL');
    expect(step.status).toBe('FAILED');
    expect(step.output.code).toBe('INTEGRATION_NOT_FOUND');
    expect(gmail.sent).toHaveLength(0);
  });

  it('26. deleting the Gmail integration removes its credential + oauth state', async () => {
    const start = await http().get('/integrations/gmail/oauth/start').set('x-test-workspace', wsA).expect(302);
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const cb = await http().get('/integrations/gmail/oauth/callback').query({ code: 'c', state }).expect(302);
    const integrationId = new URL(cb.headers.location as string).searchParams.get('integrationId')!;

    await http().delete(`/integrations/${integrationId}`).set('x-test-workspace', wsA).expect(200);

    expect(await prisma.integration.findUnique({ where: { id: integrationId } })).toBeNull();
    expect(
      await prisma.integrationCredential.count({ where: { integrationId } }),
    ).toBe(0);
    expect(await prisma.oAuthState.count({ where: { integrationId } })).toBe(0);
  });
});
