import { randomBytes } from 'node:crypto';

process.env.APP_ENCRYPTION_KEY =
  process.env.APP_ENCRYPTION_KEY && process.env.APP_ENCRYPTION_KEY.trim() !== ''
    ? process.env.APP_ENCRYPTION_KEY
    : randomBytes(32).toString('base64');

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { IntegrationsModule } from '../src/integrations/integrations.module';
import { CryptoModule } from '../src/crypto/crypto.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Mimics the workspace attach done by the real auth middleware in main.ts.
function workspaceHeaderMiddleware(req: any, _res: any, next: any) {
  const ws = req.headers['x-test-workspace'];
  if (ws) req.user = { id: 'test-user', workspaceId: String(ws) };
  next();
}

describe('Integrations API (e2e, DB-backed)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  const prisma = new PrismaService();
  let wsA = '';
  let wsB = '';

  beforeAll(async () => {
    await prisma.$connect();
    wsA = (await prisma.workspace.create({ data: { name: 'e2e A', slug: `e2e-a-${Date.now()}` } })).id;
    wsB = (await prisma.workspace.create({ data: { name: 'e2e B', slug: `e2e-b-${Date.now()}` } })).id;

    const ref = await Test.createTestingModule({ imports: [CryptoModule, IntegrationsModule] }).compile();
    app = ref.createNestApplication();
    app.use(workspaceHeaderMiddleware);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const ws of [wsA, wsB]) {
      await prisma.integrationCredential.deleteMany({ where: { workspaceId: ws } });
      await prisma.integration.deleteMany({ where: { workspaceId: ws } });
      await prisma.workspace.deleteMany({ where: { id: ws } });
    }
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  it('401s when unauthenticated (existing @Workspace() behavior preserved)', async () => {
    await http().get('/integrations').expect(401);
  });

  it('GET /integrations returns an array (backward compatible)', async () => {
    const res = await http().get('/integrations').set('x-test-workspace', wsA).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('accepts the exact web form payload and hides the secret', async () => {
    const payload = {
      provider: 'slack',
      name: 'Slack',
      config: {
        category: 'Communication',
        description: 'Send messages and notifications to Slack channels.',
        workspace: 'Acme',
        channel: '#alerts',
        credential: 'xoxb-form-secret',
      },
    };
    const res = await http()
      .post('/integrations')
      .set('x-test-workspace', wsA)
      .send(payload)
      .expect(201);

    expect(res.body.provider).toBe('slack');
    expect(res.body.hasCredential).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('xoxb-form-secret');
    expect(JSON.stringify(res.body)).not.toContain('credential');

    // legacy provider-slug GET still works
    const bySlug = await http().get('/integrations/slack').set('x-test-workspace', wsA).expect(200);
    expect(bySlug.body.id).toBe(res.body.id);
  });

  it('rejects unknown top-level body properties (controller ValidationPipe)', async () => {
    await http()
      .post('/integrations')
      .set('x-test-workspace', wsA)
      .send({ provider: 'slack', bogusTopLevel: 1 })
      .expect(400);
  });

  it('rejects an unknown provider', async () => {
    await http()
      .post('/integrations')
      .set('x-test-workspace', wsA)
      .send({ provider: 'ftp' })
      .expect(400);
  });

  it('enforces workspace isolation across the HTTP boundary', async () => {
    const created = await http()
      .post('/integrations')
      .set('x-test-workspace', wsB)
      .send({ provider: 'slack', name: 'B secret' })
      .expect(201);

    await http().get(`/integrations/${created.body.id}`).set('x-test-workspace', wsA).expect(404);
    await http().delete(`/integrations/${created.body.id}`).set('x-test-workspace', wsA).expect(404);
    await http().get(`/integrations/${created.body.id}`).set('x-test-workspace', wsB).expect(200);
  });

  it('POST /integrations/:id/test runs a real probe and updates status', async () => {
    const created = await http()
      .post('/integrations')
      .set('x-test-workspace', wsA)
      .send({ provider: 'webhook', name: 'Hook', config: { signingSecret: 'whsec_x' } })
      .expect(201);

    const res = await http()
      .post(`/integrations/${created.body.id}/test`)
      .set('x-test-workspace', wsA)
      .send({})
      .expect(201);

    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe('connected');
    expect(JSON.stringify(res.body)).not.toContain('whsec_x');
  });
});
