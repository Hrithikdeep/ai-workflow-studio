import { randomBytes } from 'node:crypto';

process.env.APP_ENCRYPTION_KEY =
  process.env.APP_ENCRYPTION_KEY && process.env.APP_ENCRYPTION_KEY.trim() !== ''
    ? process.env.APP_ENCRYPTION_KEY
    : randomBytes(32).toString('base64');

import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { IntegrationCredentialsService } from './integration-credentials.service';

describe('IntegrationCredentialsService (DB-backed)', () => {
  jest.setTimeout(30000);

  const prisma = new PrismaService();
  const svc = new IntegrationCredentialsService(prisma, new CryptoService());

  let wsA = '';
  let wsB = '';
  let intA = '';

  beforeAll(async () => {
    await prisma.$connect();
    wsA = (
      await prisma.workspace.create({
        data: { name: 'C ws A', slug: `c-a-${Date.now()}-${randomBytes(3).toString('hex')}` },
      })
    ).id;
    wsB = (
      await prisma.workspace.create({
        data: { name: 'C ws B', slug: `c-b-${Date.now()}-${randomBytes(3).toString('hex')}` },
      })
    ).id;
    intA = (
      await prisma.integration.create({
        data: { workspaceId: wsA, provider: 'slack', name: 'x', status: 'available', config: {} },
      })
    ).id;
  });

  afterAll(async () => {
    for (const ws of [wsA, wsB]) {
      await prisma.integrationCredential.deleteMany({ where: { workspaceId: ws } });
      await prisma.integration.deleteMany({ where: { workspaceId: ws } });
      await prisma.workspace.deleteMany({ where: { id: ws } });
    }
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.integrationCredential.deleteMany({ where: { workspaceId: wsA } });
    await prisma.integrationCredential.deleteMany({ where: { workspaceId: wsB } });
  });

  it('encrypts on write; ciphertext never contains the plaintext', async () => {
    await svc.upsertForIntegration({
      workspaceId: wsA,
      integrationId: intA,
      provider: 'slack',
      name: 'x',
      secrets: { botToken: 'xoxb-plaintext-value' },
    });

    const row = await prisma.integrationCredential.findFirst({
      where: { workspaceId: wsA, integrationId: intA },
    });
    expect(row?.data).toMatch(/^v1:/);
    expect(row?.data).not.toContain('xoxb-plaintext-value');
  });

  it('upsert updates the same row instead of creating a second', async () => {
    const first = await svc.upsertForIntegration({
      workspaceId: wsA, integrationId: intA, provider: 'slack', name: 'x',
      secrets: { botToken: 'one' },
    });
    expect(first.created).toBe(true);

    const second = await svc.upsertForIntegration({
      workspaceId: wsA, integrationId: intA, provider: 'slack', name: 'x',
      secrets: { botToken: 'two' },
    });
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);

    expect(await svc.getDecryptedForIntegration(wsA, intA)).toEqual({ botToken: 'two' });
    expect(
      await prisma.integrationCredential.count({ where: { integrationId: intA } }),
    ).toBe(1);
  });

  it('is workspace-scoped for read and delete', async () => {
    await svc.upsertForIntegration({
      workspaceId: wsA, integrationId: intA, provider: 'slack', name: 'x',
      secrets: { botToken: 'secret' },
    });

    expect(await svc.getDecryptedForIntegration(wsB, intA)).toBeNull();
    expect(await svc.hasCredentialForIntegration(wsB, intA)).toBe(false);
    expect(await svc.deleteForIntegration(wsB, intA)).toBe(0);

    expect(await svc.hasCredentialForIntegration(wsA, intA)).toBe(true);
    expect(await svc.deleteForIntegration(wsA, intA)).toBe(1);
    expect(await svc.hasCredentialForIntegration(wsA, intA)).toBe(false);
  });
});
