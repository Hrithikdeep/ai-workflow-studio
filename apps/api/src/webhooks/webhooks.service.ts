import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { ExecutionsService } from '../executions/executions.service';
import { WorkflowsService } from '../workflows/workflows.service';

/** Public metadata for a workflow's webhook. Never contains the secret. */
export interface WebhookConfig {
  workflowId: string;
  path: string;
  enabled: boolean;
  hasSecret: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface WebhookTriggerResult {
  accepted: boolean;
  executionId: string | null;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  duplicate?: boolean;
}

const WEBHOOK_PATH = (workflowId: string) => `/webhooks/${workflowId}`;
const IDEMPOTENCY_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  /**
   * Best-effort, in-process dedupe of repeated deliveries carrying the same
   * `X-Webhook-Event-Id`. Not durable across restarts / multiple instances
   * (documented limitation).
   */
  private readonly seenEvents = new Map<string, { at: number; result: WebhookTriggerResult }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly executions: ExecutionsService,
    private readonly workflows: WorkflowsService,
  ) {}

  // ==========================================================================
  // AUTHENTICATED CONFIG (workspace-scoped)
  // ==========================================================================

  /** Create the webhook if missing, otherwise rotate its secret. Returns the
   *  plaintext secret ONCE. */
  async rotateSecret(
    workspaceId: string,
    workflowId: string,
  ): Promise<WebhookConfig & { secret: string }> {
    // Confirms the workflow exists (404 otherwise).
    await this.workflows.findOne(workflowId);

    const existing = await this.prisma.workflowWebhook.findUnique({
      where: { workflowId },
    });
    if (existing && existing.workspaceId !== workspaceId) {
      // Do not disclose that another workspace owns it.
      throw new NotFoundException('Workflow not found');
    }

    const secret = randomBytes(32).toString('base64url');
    const encrypted = this.crypto.encrypt(secret);

    const row = existing
      ? await this.prisma.workflowWebhook.update({
          where: { workflowId },
          data: { secret: encrypted },
        })
      : await this.prisma.workflowWebhook.create({
          data: { workflowId, workspaceId, secret: encrypted, enabled: true },
        });

    return { ...this.toConfig(row), secret };
  }

  async getConfig(
    workspaceId: string,
    workflowId: string,
  ): Promise<WebhookConfig> {
    await this.workflows.findOne(workflowId);

    const row = await this.prisma.workflowWebhook.findUnique({
      where: { workflowId },
    });
    if (!row) {
      return {
        workflowId,
        path: WEBHOOK_PATH(workflowId),
        enabled: false,
        hasSecret: false,
        createdAt: null,
        updatedAt: null,
      };
    }
    if (row.workspaceId !== workspaceId) {
      throw new NotFoundException('Workflow not found');
    }
    return this.toConfig(row);
  }

  async setEnabled(
    workspaceId: string,
    workflowId: string,
    enabled: boolean,
  ): Promise<WebhookConfig> {
    const row = await this.prisma.workflowWebhook.findUnique({
      where: { workflowId },
    });
    if (!row || row.workspaceId !== workspaceId) {
      throw new NotFoundException('Webhook not configured for this workflow');
    }
    const updated = await this.prisma.workflowWebhook.update({
      where: { workflowId },
      data: { enabled },
    });
    return this.toConfig(updated);
  }

  // ==========================================================================
  // PUBLIC INBOUND TRIGGER (no session; authenticated by the webhook secret)
  // ==========================================================================

  async trigger(params: {
    workflowId: string;
    providedSecret: string | undefined;
    body: unknown;
    query: Record<string, unknown>;
    eventId?: string;
  }): Promise<WebhookTriggerResult> {
    const { workflowId, providedSecret, body, query, eventId } = params;

    const webhook = await this.prisma.workflowWebhook.findUnique({
      where: { workflowId },
    });
    // Unknown workflow / never configured -> opaque 404.
    if (!webhook) {
      throw new NotFoundException('Not found');
    }

    if (!webhook.enabled) {
      throw new ForbiddenException('Webhook is disabled');
    }

    // Constant-time secret check. Never logs either value.
    const expected = this.crypto.decrypt(webhook.secret);
    if (!this.secretMatches(providedSecret, expected)) {
      this.logger.warn(`Webhook ${workflowId}: rejected — invalid secret`);
      throw new UnauthorizedException('Invalid webhook credentials');
    }

    // Idempotency: replay the stored result for a repeated event id.
    const dedupeKey = eventId ? `${workflowId}:${eventId}` : null;
    if (dedupeKey) {
      const hit = this.recallEvent(dedupeKey);
      if (hit) {
        return { ...hit, duplicate: true };
      }
    }

    // Resolve the version to execute: published wins, else latest.
    const version =
      (await this.prisma.workflowVersion.findFirst({
        where: { workflowId, isPublished: true },
        orderBy: { version: 'desc' },
        include: { nodes: { select: { type: true } } },
      })) ??
      (await this.prisma.workflowVersion.findFirst({
        where: { workflowId },
        orderBy: { version: 'desc' },
        include: { nodes: { select: { type: true } } },
      }));

    if (!version) {
      throw new BadRequestException('Workflow has no saved version');
    }
    if (!version.nodes.some((n) => n.type === 'WEBHOOK')) {
      throw new BadRequestException('Workflow has no webhook trigger node');
    }

    // Runtime input = query params overlaid by the JSON body.
    const input: Record<string, unknown> = {
      ...this.plainObject(query),
      ...this.plainObject(body),
    };

    const execution = await this.executions.runWorkflow(
      workflowId,
      version.id,
      input,
      'WEBHOOK',
      {},
      webhook.workspaceId, // workspace is taken ONLY from the persisted webhook
    );

    const result: WebhookTriggerResult = {
      accepted: true,
      executionId: execution.id,
      status: execution.status,
      startedAt: execution.startedAt ?? null,
      completedAt: execution.completedAt ?? null,
      error: this.safeError(execution.error),
    };

    if (dedupeKey) {
      this.rememberEvent(dedupeKey, result);
    }
    return result;
  }

  // ==========================================================================
  // helpers
  // ==========================================================================

  private toConfig(row: {
    workflowId: string;
    enabled: boolean;
    secret: string;
    createdAt: Date;
    updatedAt: Date;
  }): WebhookConfig {
    return {
      workflowId: row.workflowId,
      path: WEBHOOK_PATH(row.workflowId),
      enabled: row.enabled,
      hasSecret: Boolean(row.secret),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private secretMatches(provided: string | undefined, expected: string): boolean {
    if (!provided || typeof provided !== 'string') return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  private plainObject(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  /** Only surface the resolution/error message; never a stack or internals. */
  private safeError(error: string | null | undefined): string | null {
    if (!error) return null;
    return String(error).split('\n')[0].slice(0, 300);
  }

  private recallEvent(key: string): WebhookTriggerResult | null {
    const hit = this.seenEvents.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > IDEMPOTENCY_TTL_MS) {
      this.seenEvents.delete(key);
      return null;
    }
    return hit.result;
  }

  private rememberEvent(key: string, result: WebhookTriggerResult): void {
    this.seenEvents.set(key, { at: Date.now(), result });
    if (this.seenEvents.size > 5000) {
      const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
      for (const [k, v] of this.seenEvents) {
        if (v.at < cutoff) this.seenEvents.delete(k);
      }
    }
  }
}
