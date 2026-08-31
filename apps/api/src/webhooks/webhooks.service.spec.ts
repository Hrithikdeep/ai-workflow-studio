import { randomBytes } from 'node:crypto';

process.env.APP_ENCRYPTION_KEY =
  process.env.APP_ENCRYPTION_KEY && process.env.APP_ENCRYPTION_KEY.trim() !== ''
    ? process.env.APP_ENCRYPTION_KEY
    : randomBytes(32).toString('base64');

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { CryptoService } from '../crypto/crypto.service';
import { WebhooksService } from './webhooks.service';

const crypto = new CryptoService();

function makeService(overrides: {
  webhookRow?: unknown;
  version?: unknown;
  runWorkflow?: jest.Mock;
} = {}) {
  const runWorkflow =
    overrides.runWorkflow ??
    jest.fn().mockResolvedValue({
      id: 'exec-1',
      status: 'SUCCEEDED',
      startedAt: new Date('2026-08-30T00:00:00Z'),
      completedAt: new Date('2026-08-30T00:00:01Z'),
      error: null,
    });

  const prisma = {
    workflowWebhook: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.webhookRow === undefined
          ? {
              workflowId: 'wf-1',
              workspaceId: 'ws-1',
              secret: crypto.encrypt('the-real-secret'),
              enabled: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          : overrides.webhookRow,
      ),
      create: jest.fn().mockImplementation(({ data }) => ({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      update: jest.fn().mockImplementation(({ data }) => ({
        workflowId: 'wf-1',
        workspaceId: 'ws-1',
        secret: data.secret ?? crypto.encrypt('the-real-secret'),
        enabled: data.enabled ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    },
    workflowVersion: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        if (where.isPublished) return null;
        return (
          overrides.version ?? {
            id: 'ver-1',
            nodes: [{ type: 'WEBHOOK' }, { type: 'SLACK' }],
          }
        );
      }),
    },
  } as never;

  const executions = { runWorkflow } as never;
  const workflows = { findOne: jest.fn().mockResolvedValue({ id: 'wf-1' }) } as never;

  const service = new WebhooksService(prisma, crypto, executions, workflows);
  return { service, prisma: prisma as never, runWorkflow, workflows };
}

const baseTrigger = {
  workflowId: 'wf-1',
  providedSecret: 'the-real-secret',
  body: { name: 'Hrithik' } as unknown,
  query: {} as Record<string, unknown>,
};

describe('WebhooksService', () => {
  it('1/2. resolves workflow + runs it in the webhook record\'s workspace', async () => {
    const { service, runWorkflow } = makeService();
    const res = await service.trigger(baseTrigger);

    expect(res.accepted).toBe(true);
    expect(res.executionId).toBe('exec-1');
    expect(res.status).toBe('SUCCEEDED');
    expect(runWorkflow).toHaveBeenCalledWith(
      'wf-1',
      'ver-1',
      { name: 'Hrithik' }, // 9. runtime input from body
      'WEBHOOK',
      {},
      'ws-1', // workspace ONLY from the persisted webhook row
    );
  });

  it('3. request cannot choose a different workspace', async () => {
    const { service, runWorkflow } = makeService();
    // Body attempts to inject workspaceId — it is ignored.
    await service.trigger({
      ...baseTrigger,
      body: { name: 'x', workspaceId: 'ws-ATTACKER' },
    });
    expect(runWorkflow.mock.calls[0][5]).toBe('ws-1');
  });

  it('4. invalid secret is rejected and does not execute', async () => {
    const { service, runWorkflow } = makeService();
    await expect(
      service.trigger({ ...baseTrigger, providedSecret: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(runWorkflow).not.toHaveBeenCalled();
  });

  it('4b. missing secret is rejected', async () => {
    const { service } = makeService();
    await expect(
      service.trigger({ ...baseTrigger, providedSecret: undefined }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('5. valid secret is accepted', async () => {
    const { service } = makeService();
    await expect(service.trigger(baseTrigger)).resolves.toMatchObject({
      accepted: true,
    });
  });

  it('8. disabled webhook is rejected and does not execute', async () => {
    const { service, runWorkflow } = makeService({
      webhookRow: {
        workflowId: 'wf-1',
        workspaceId: 'ws-1',
        secret: crypto.encrypt('the-real-secret'),
        enabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await expect(service.trigger(baseTrigger)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(runWorkflow).not.toHaveBeenCalled();
  });

  it('unknown workflow -> opaque 404, no execution', async () => {
    const { service, runWorkflow } = makeService({ webhookRow: null });
    await expect(service.trigger(baseTrigger)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(runWorkflow).not.toHaveBeenCalled();
  });

  it('13. workflow with no WEBHOOK node is rejected', async () => {
    const { service, runWorkflow } = makeService({
      version: { id: 'ver-1', nodes: [{ type: 'MANUAL_TRIGGER' }] },
    });
    await expect(service.trigger(baseTrigger)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(runWorkflow).not.toHaveBeenCalled();
  });

  it('9b. query params merge into runtime input (body wins)', async () => {
    const { service, runWorkflow } = makeService();
    await service.trigger({
      ...baseTrigger,
      body: { name: 'Body' },
      query: { name: 'Query', source: 'zendesk' },
    });
    expect(runWorkflow.mock.calls[0][2]).toEqual({
      name: 'Body',
      source: 'zendesk',
    });
  });

  it('10. secret never appears in the trigger result', async () => {
    const { service } = makeService();
    const res = await service.trigger(baseTrigger);
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain('the-real-secret');
    expect(serialized).not.toMatch(/secret/i);
  });

  it('idempotency: same X-Webhook-Event-Id replays without re-executing', async () => {
    const { service, runWorkflow } = makeService();
    const first = await service.trigger({ ...baseTrigger, eventId: 'evt-42' });
    const second = await service.trigger({ ...baseTrigger, eventId: 'evt-42' });

    expect(runWorkflow).toHaveBeenCalledTimes(1);
    expect(first.duplicate).toBeUndefined();
    expect(second.duplicate).toBe(true);
    expect(second.executionId).toBe(first.executionId);
  });

  it('rotateSecret creates a row, returns the plaintext once, keeps it out of getConfig', async () => {
    const { service, prisma } = makeService({ webhookRow: null });
    const rotated = await service.rotateSecret('ws-1', 'wf-1');
    expect(rotated.secret).toEqual(expect.any(String));
    expect(rotated.secret.length).toBeGreaterThan(20);
    expect((prisma as never as { workflowWebhook: { create: jest.Mock } }).workflowWebhook.create)
      .toHaveBeenCalled();

    // getConfig never returns the secret
    const cfgService = makeService().service;
    const cfg = await cfgService.getConfig('ws-1', 'wf-1');
    expect(JSON.stringify(cfg)).not.toMatch(/the-real-secret/);
    expect('secret' in cfg).toBe(false);
  });

  it('foreign workspace cannot read or rotate the webhook', async () => {
    const { service } = makeService({
      webhookRow: {
        workflowId: 'wf-1',
        workspaceId: 'ws-OWNER',
        secret: crypto.encrypt('the-real-secret'),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await expect(service.getConfig('ws-OTHER', 'wf-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.rotateSecret('ws-OTHER', 'wf-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('setEnabled toggles the owning workspace and rejects a foreign one', async () => {
    const { service, prisma } = makeService();
    const update = (
      prisma as never as { workflowWebhook: { update: jest.Mock } }
    ).workflowWebhook.update;

    const disabled = await service.setEnabled('ws-1', 'wf-1', false);
    expect(update).toHaveBeenCalledWith({
      where: { workflowId: 'wf-1' },
      data: { enabled: false },
    });
    expect(disabled.enabled).toBe(false);
    expect('secret' in disabled).toBe(false);

    const foreign = makeService({
      webhookRow: {
        workflowId: 'wf-1',
        workspaceId: 'ws-OWNER',
        secret: crypto.encrypt('the-real-secret'),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await expect(
      foreign.service.setEnabled('ws-OTHER', 'wf-1', true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
