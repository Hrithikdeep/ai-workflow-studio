import { randomBytes } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';

// A valid encryption key must exist before CryptoService is first used.
process.env.APP_ENCRYPTION_KEY =
  process.env.APP_ENCRYPTION_KEY && process.env.APP_ENCRYPTION_KEY.trim() !== ''
    ? process.env.APP_ENCRYPTION_KEY
    : randomBytes(32).toString('base64');

import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { IntegrationCredentialsService } from './integration-credentials.service';
import {
  IntegrationProbeService,
  type ProbeResult,
} from './integration-probe.service';
import { IntegrationsService } from './integrations.service';

/** Deterministic probe stub so status transitions can be tested offline. */
class StubProbe {
  next: ProbeResult = { ok: true, code: 'OK', message: 'stub ok' };
  async probe(): Promise<ProbeResult> {
    return this.next;
  }
}

describe('IntegrationsService (Step 2 hardening, DB-backed)', () => {
  jest.setTimeout(30000);

  const prisma = new PrismaService();
  const crypto = new CryptoService();
  const credentials = new IntegrationCredentialsService(prisma, crypto);

  const stubProbe = new StubProbe();
  const service = new IntegrationsService(
    prisma,
    credentials,
    stubProbe as unknown as IntegrationProbeService,
  );
  const realProbeService = new IntegrationProbeService();
  const serviceRealProbe = new IntegrationsService(
    prisma,
    credentials,
    realProbeService,
  );

  let wsA = '';
  let wsB = '';

  beforeAll(async () => {
    await prisma.$connect();
    const a = await prisma.workspace.create({
      data: { name: 'S2 ws A', slug: `s2-a-${Date.now()}-${randomBytes(3).toString('hex')}` },
    });
    const b = await prisma.workspace.create({
      data: { name: 'S2 ws B', slug: `s2-b-${Date.now()}-${randomBytes(3).toString('hex')}` },
    });
    wsA = a.id;
    wsB = b.id;
  });

  afterAll(async () => {
    for (const ws of [wsA, wsB]) {
      if (!ws) continue;
      await prisma.integrationCredential.deleteMany({ where: { workspaceId: ws } });
      await prisma.integration.deleteMany({ where: { workspaceId: ws } });
      await prisma.workspace.deleteMany({ where: { id: ws } });
    }
    await prisma.$disconnect();
  });

  afterEach(async () => {
    for (const ws of [wsA, wsB]) {
      await prisma.integrationCredential.deleteMany({ where: { workspaceId: ws } });
      await prisma.integration.deleteMany({ where: { workspaceId: ws } });
    }
    stubProbe.next = { ok: true, code: 'OK', message: 'stub ok' };
  });

  // 1
  it('creates an integration row scoped to the workspace', async () => {
    const created = await service.create(wsA, {
      provider: 'slack',
      name: 'Prod Slack',
      config: { channel: '#alerts' },
    });

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created.workspaceId).toBe(wsA);
    expect(created.provider).toBe('slack');
    expect(created.name).toBe('Prod Slack');
    expect(created.status).toBe('available');

    const row = await prisma.integration.findUnique({ where: { id: created.id } });
    expect(row?.workspaceId).toBe(wsA);
  });

  // 2 + 15
  it('rejects an invalid provider config (bad URL, bad enum, unknown key)', async () => {
    await expect(
      service.create(wsA, { provider: 'http', config: { baseUrl: 'not-a-url' } }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create(wsA, {
        provider: 'http',
        config: { baseUrl: 'https://x.test', authType: 'Nonsense' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create(wsA, {
        provider: 'slack',
        config: { totallyUnknownKey: 'x' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // 16
  it('rejects an unknown provider', async () => {
    await expect(
      service.create(wsA, { provider: 'ftp' as unknown as string, config: {} }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // 3 + 17
  it('encrypts secret fields and never stores them in Integration.config', async () => {
    const created = await service.create(wsA, {
      provider: 'slack',
      name: 'With Secret',
      config: { channel: '#ops', credential: 'xoxb-secret-token-123' },
    });

    const row = await prisma.integration.findUnique({ where: { id: created.id } });
    const rawConfig = JSON.stringify(row?.config ?? {});
    expect(rawConfig).not.toContain('xoxb-secret-token-123');
    expect(rawConfig).not.toContain('credential');

    const credRow = await prisma.integrationCredential.findFirst({
      where: { workspaceId: wsA, integrationId: created.id },
    });
    expect(credRow).toBeTruthy();
    expect(credRow?.data).toMatch(/^v1:/);
    expect(credRow?.data).not.toContain('xoxb-secret-token-123');

    const decrypted = await credentials.getDecryptedForIntegration(
      wsA,
      created.id,
    );
    expect(decrypted).toEqual({ credential: 'xoxb-secret-token-123' });
  });

  // 3b — OpenAI: apiKey goes through the SAME split + encrypted-credential path
  it('stores an OpenAI apiKey only in the encrypted credential, never in Integration.config', async () => {
    const OPENAI_KEY = 'sk-test-openai-key-not-in-config-or-response';

    const created = await service.create(wsA, {
      provider: 'openai',
      name: 'Prod OpenAI',
      config: { apiKey: OPENAI_KEY },
    });

    // C — the key is absent from the Integration row's config
    const row = await prisma.integration.findUnique({ where: { id: created.id } });
    const rawConfig = JSON.stringify(row?.config ?? {});
    expect(rawConfig).not.toContain(OPENAI_KEY);
    expect(rawConfig).not.toContain('apiKey');

    // D — the key was handed to the existing credential flow and encrypted
    const credRow = await prisma.integrationCredential.findFirst({
      where: { workspaceId: wsA, integrationId: created.id },
    });
    expect(credRow).toBeTruthy();
    expect(credRow?.data).toMatch(/^v1:/);
    expect(credRow?.data).not.toContain(OPENAI_KEY);

    const decrypted = await credentials.getDecryptedForIntegration(
      wsA,
      created.id,
    );
    expect(decrypted).toEqual({ apiKey: OPENAI_KEY });

    // never surfaced through the safe API shapes
    const viaGet = await service.get(wsA, created.id);
    const viaList = await service.list(wsA);
    for (const blob of [created, viaGet, ...viaList].map((x) => JSON.stringify(x))) {
      expect(blob).not.toContain(OPENAI_KEY);
      expect(blob).not.toContain('"apiKey"');
    }
    expect(viaGet.hasCredential).toBe(true);
    expect(created.provider).toBe('openai');
  });

  // 4
  it('never returns secret material from create / get / list', async () => {
    const created = await service.create(wsA, {
      provider: 'postgresql',
      name: 'DB',
      config: {
        host: 'db.example.com',
        database: 'app',
        username: 'svc',
        credential: 'p0stgr3s-pw',
      },
    });

    const viaGet = await service.get(wsA, created.id);
    const viaList = await service.list(wsA);
    const blobs = [created, viaGet, ...viaList].map((x) => JSON.stringify(x));

    for (const blob of blobs) {
      expect(blob).not.toContain('p0stgr3s-pw');
      expect(blob).not.toContain('"credential"');
      expect(blob).not.toContain('"password"');
    }
    expect(viaGet.hasCredential).toBe(true);
  });

  // 5
  it('updates non-secret config and name', async () => {
    const created = await service.create(wsA, {
      provider: 'slack',
      name: 'Before',
      config: { channel: '#a' },
    });

    const updated = await service.update(wsA, created.id, {
      name: 'After',
      config: { channel: '#b', workspace: 'Acme' },
    });

    expect(updated.name).toBe('After');
    expect(updated.config.channel).toBe('#b');
    expect(updated.config.workspace).toBe('Acme');
  });

  // 6
  it('preserves an existing credential when secrets are omitted on update', async () => {
    const created = await service.create(wsA, {
      provider: 'slack',
      name: 'Keep',
      config: { channel: '#a', credential: 'xoxb-keep-me' },
    });

    await service.update(wsA, created.id, { config: { channel: '#c' } });

    const decrypted = await credentials.getDecryptedForIntegration(
      wsA,
      created.id,
    );
    expect(decrypted).toEqual({ credential: 'xoxb-keep-me' });
  });

  it('replaces the credential when a new secret is supplied on update', async () => {
    const created = await service.create(wsA, {
      provider: 'slack',
      name: 'Rotate',
      config: { credential: 'xoxb-old' },
    });

    await service.update(wsA, created.id, { config: { credential: 'xoxb-new' } });

    const decrypted = await credentials.getDecryptedForIntegration(
      wsA,
      created.id,
    );
    expect(decrypted).toEqual({ credential: 'xoxb-new' });

    const count = await prisma.integrationCredential.count({
      where: { workspaceId: wsA, integrationId: created.id },
    });
    expect(count).toBe(1);
  });

  // 7
  it('allows multiple named connections for the same provider', async () => {
    const a = await service.create(wsA, { provider: 'slack', name: 'Production Slack' });
    const b = await service.create(wsA, { provider: 'slack', name: 'Staging Slack' });

    expect(a.id).not.toBe(b.id);
    const list = await service.list(wsA);
    const slackNames = list.filter((i) => i.provider === 'slack').map((i) => i.name).sort();
    expect(slackNames).toEqual(['Production Slack', 'Staging Slack']);
  });

  // 8
  it('isolates integrations by workspace in list()', async () => {
    await service.create(wsA, { provider: 'slack', name: 'A only' });
    await service.create(wsB, { provider: 'slack', name: 'B only' });

    const listA = await service.list(wsA);
    const listB = await service.list(wsB);

    expect(listA.every((i) => i.workspaceId === wsA)).toBe(true);
    expect(listA.map((i) => i.name)).toContain('A only');
    expect(listA.map((i) => i.name)).not.toContain('B only');
    expect(listB.map((i) => i.name)).toEqual(['B only']);
  });

  // 9
  it('does not expose a foreign-workspace integration by id', async () => {
    const inB = await service.create(wsB, { provider: 'slack', name: 'secret B' });

    await expect(service.get(wsA, inB.id)).rejects.toBeInstanceOf(
      Error,
    );
    await expect(service.update(wsA, inB.id, { name: 'hijack' })).rejects.toThrow();
    await expect(service.remove(wsA, inB.id)).rejects.toThrow();

    const stillThere = await prisma.integration.findUnique({ where: { id: inB.id } });
    expect(stillThere?.name).toBe('secret B');
  });

  // 10
  it('does not decrypt a foreign-workspace credential', async () => {
    const inB = await service.create(wsB, {
      provider: 'slack',
      name: 'B creds',
      config: { credential: 'xoxb-b-only' },
    });

    const fromA = await credentials.getDecryptedForIntegration(wsA, inB.id);
    expect(fromA).toBeNull();
  });

  // 11
  it('deletes the integration and its credential', async () => {
    const created = await service.create(wsA, {
      provider: 'slack',
      name: 'Doomed',
      config: { credential: 'xoxb-doomed' },
    });

    const res = await service.remove(wsA, created.id);
    expect(res).toEqual({ id: created.id, deleted: true });

    expect(await prisma.integration.findUnique({ where: { id: created.id } })).toBeNull();
    expect(
      await prisma.integrationCredential.count({
        where: { integrationId: created.id },
      }),
    ).toBe(0);
  });

  // 12 + 14
  it('test() marks a successful probe as connected', async () => {
    const created = await service.create(wsA, {
      provider: 'slack',
      name: 'Testable',
      config: { credential: 'xoxb-abc' },
    });
    stubProbe.next = { ok: true, code: 'OK', message: 'Authenticated with Slack.' };

    const result = await service.test(wsA, created.id, {});
    expect(result.ok).toBe(true);
    expect(result.status).toBe('connected');

    const row = await prisma.integration.findUnique({ where: { id: created.id } });
    expect(row?.status).toBe('connected');
  });

  // 13
  it('test() marks a failed probe as error', async () => {
    const created = await service.create(wsA, {
      provider: 'slack',
      name: 'Broken',
      config: { credential: 'xoxb-bad' },
    });
    stubProbe.next = { ok: false, code: 'AUTH_FAILED', message: 'Slack rejected the token.' };

    const result = await service.test(wsA, created.id, {});
    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');

    const row = await prisma.integration.findUnique({ where: { id: created.id } });
    expect(row?.status).toBe('error');
  });

  it('test() does not expose secrets and cannot target a foreign workspace', async () => {
    const inB = await service.create(wsB, {
      provider: 'slack',
      name: 'B testable',
      config: { credential: 'xoxb-b-secret' },
    });

    await expect(service.test(wsA, inB.id, {})).rejects.toThrow();
  });

  // real-probe smoke: webhook readiness (no network), offline-safe
  it('real probe: webhook reports readiness from the signing secret only', async () => {
    const withSecret = await serviceRealProbe.create(wsA, {
      provider: 'webhook',
      name: 'Hook A',
      config: { endpointName: 'orders', signingSecret: 'whsec_123' },
    });
    const ready = await serviceRealProbe.test(wsA, withSecret.id, {});
    expect(ready.ok).toBe(true);
    expect(ready.status).toBe('connected');

    const withoutSecret = await serviceRealProbe.create(wsA, {
      provider: 'webhook',
      name: 'Hook B',
      config: { endpointName: 'refunds' },
    });
    const notReady = await serviceRealProbe.test(wsA, withoutSecret.id, {});
    expect(notReady.ok).toBe(false);
    expect(notReady.code).toBe('MISSING_CREDENTIAL');
  });

  // real-probe smoke: gmail is honestly unsupported (no fake success)
  it('real probe: gmail returns NOT_SUPPORTED_YET without faking success', async () => {
    const gmail = await serviceRealProbe.create(wsA, {
      provider: 'gmail',
      name: 'Mail',
      config: { account: 'ops@example.com', credential: 'apppw' },
    });
    const res = await serviceRealProbe.test(wsA, gmail.id, {});
    expect(res.ok).toBe(false);
    expect(res.code).toBe('NOT_SUPPORTED_YET');
    expect(res.status).not.toBe('connected');
  });

  // backward compatibility: provider-slug GET still works
  it('resolves GET by provider slug (legacy) and by row id', async () => {
    const created = await service.create(wsA, { provider: 'slack', name: 'Legacy' });

    const bySlug = await service.get(wsA, 'slack');
    expect(bySlug.id).toBe(created.id);

    const byId = await service.get(wsA, created.id);
    expect(byId.id).toBe(created.id);

    // unknown provider with no row -> synthetic catalog entry
    const catalog = await service.get(wsA, 'http');
    expect(catalog.provider).toBe('http');
    expect(catalog.status).toBe('available');
    expect(catalog.hasCredential).toBe(false);
  });
});
