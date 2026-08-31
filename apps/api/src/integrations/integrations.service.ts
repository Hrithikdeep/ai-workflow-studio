import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';

import { PrismaService } from '../prisma/prisma.service';
import { IntegrationCredentialsService } from './integration-credentials.service';
import {
  IntegrationProbeService,
  type ProbeResult,
} from './integration-probe.service';
import { GmailOAuthService } from './gmail/gmail-oauth.service';
import {
  DEFAULT_METADATA,
  INTEGRATION_STATUS,
  isSupportedProvider,
  splitProviderConfig,
  SUPPORTED_PROVIDERS,
  type IntegrationProvider,
} from './integration-providers';

import { BaseIntegrationConfigDto } from './dto/base-integration-config.dto';
import { HttpIntegrationConfigDto } from './dto/http-integration.dto';
import { WebhookIntegrationConfigDto } from './dto/webhook-integration.dto';
import { SlackIntegrationConfigDto } from './dto/slack-integration.dto';
import { GmailIntegrationConfigDto } from './dto/gmail-integration.dto';
import { PostgresIntegrationConfigDto } from './dto/postgres-integration.dto';
import { OpenAiIntegrationConfigDto } from './dto/openai-integration.dto';
import type { CreateIntegrationDto } from './dto/create-integration.dto';
import type { UpdateIntegrationDto } from './dto/update-integration.dto';
import type { TestIntegrationDto } from './dto/test-integration.dto';

type ProviderConfigDtoCtor = new () => BaseIntegrationConfigDto;

const PROVIDER_CONFIG_DTO: Record<IntegrationProvider, ProviderConfigDtoCtor> = {
  http: HttpIntegrationConfigDto,
  webhook: WebhookIntegrationConfigDto,
  slack: SlackIntegrationConfigDto,
  gmail: GmailIntegrationConfigDto,
  postgresql: PostgresIntegrationConfigDto,
  openai: OpenAiIntegrationConfigDto,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shape returned to API clients — never contains secret material. */
export interface SafeIntegration {
  id: string;
  workspaceId: string;
  provider: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  hasCredential: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IntegrationTestResult {
  integrationId: string;
  provider: string;
  ok: boolean;
  status: string;
  /** Probe outcome slug — `ProbeResult['code']` plus Gmail-OAuth-specific codes. */
  code: ProbeResult['code'] | 'NOT_CONFIGURED' | 'AUTH_REVOKED' | 'INSUFFICIENT_SCOPE';
  message: string;
  detail?: Record<string, unknown>;
  checkedAt: string;
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: IntegrationCredentialsService,
    private readonly probes: IntegrationProbeService,
    // Optional so `new IntegrationsService(prisma, creds, probes)` (unit
    // tests) keeps working; always injected by Nest. Handles the real
    // OAuth-backed Gmail connection test.
    private readonly gmailOAuth?: GmailOAuthService,
  ) {}

  // ==========================================================================
  // READ
  // ==========================================================================

  /** All real integration rows for the workspace, as safe metadata. */
  async list(workspaceId: string): Promise<SafeIntegration[]> {
    const rows = await this.prisma.integration.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });

    return Promise.all(rows.map((row) => this.toSafe(row)));
  }

  /**
   * Resolve by real row id (UUID) OR by provider slug (legacy). When a slug
   * has no row yet, a synthetic "available" catalog entry is returned so the
   * existing detail page keeps working for not-yet-connected providers.
   */
  async get(workspaceId: string, idOrSlug: string): Promise<SafeIntegration> {
    const row = await this.resolve(workspaceId, idOrSlug, { allowMissingSlug: true });
    if (row) {
      return this.toSafe(row);
    }

    // No row: only a bare provider slug earns a synthetic catalog entry.
    if (!isSupportedProvider(idOrSlug)) {
      throw new NotFoundException('Integration not found');
    }

    const provider = idOrSlug;
    const meta = DEFAULT_METADATA[provider];
    return {
      id: provider,
      workspaceId,
      provider,
      name: meta.name,
      status: INTEGRATION_STATUS.available,
      config: { category: meta.category, description: meta.description },
      hasCredential: false,
    };
  }

  /**
   * Internal lookup for the execution engine. Resolves a real integration
   * row by id, scoped to `workspaceId`. Returns `null` (no synthetic
   * catalog fallback, no leak) when the workspace does not own it.
   */
  async getForExecution(
    workspaceId: string,
    integrationId: string,
  ): Promise<{
    id: string;
    provider: string;
    name: string;
    config: unknown;
  } | null> {
    const row = await this.prisma.integration.findFirst({
      where: { id: integrationId, workspaceId },
      // `config` holds only non-secret fields (host/port/database/…); secrets
      // live in IntegrationCredential.
      select: { id: true, provider: true, name: true, config: true },
    });
    return row ?? null;
  }

  // ==========================================================================
  // CREATE
  // ==========================================================================

  async create(
    workspaceId: string,
    dto: CreateIntegrationDto,
  ): Promise<SafeIntegration> {
    const provider = this.assertProvider(dto.provider);
    const { config, secrets } = this.validateAndSplit(provider, dto.config);

    const name = (dto.name ?? '').trim() || DEFAULT_METADATA[provider].name;
    const mergedConfig = this.withDefaultMetadata(provider, config);

    const created = await this.prisma.integration.create({
      data: {
        workspaceId,
        provider,
        name,
        status: INTEGRATION_STATUS.available,
        config: mergedConfig as Prisma.InputJsonValue,
      },
    });

    if (Object.keys(secrets).length > 0) {
      await this.credentials.upsertForIntegration({
        workspaceId,
        integrationId: created.id,
        provider,
        name,
        secrets,
      });
    }

    return this.toSafe(created);
  }

  // ==========================================================================
  // UPDATE
  // ==========================================================================

  async update(
    workspaceId: string,
    idOrSlug: string,
    dto: UpdateIntegrationDto,
  ): Promise<SafeIntegration> {
    const existing = await this.resolveOrThrow(workspaceId, idOrSlug);
    const provider = existing.provider as IntegrationProvider;

    const { config: newConfig, secrets } = this.validateAndSplit(
      provider,
      dto.config,
    );

    // Merge non-secret config; never let a secret key survive in config.
    const currentConfig = this.asRecord(existing.config);
    const mergedConfig =
      dto.config === undefined
        ? currentConfig
        : this.withDefaultMetadata(provider, {
            ...currentConfig,
            ...newConfig,
          });

    const name = dto.name?.trim() ? dto.name.trim() : existing.name;

    const updated = await this.prisma.integration.update({
      where: { id: existing.id },
      data: { name, config: mergedConfig as Prisma.InputJsonValue },
    });

    // Only touch the credential when new secret values were supplied.
    if (Object.keys(secrets).length > 0) {
      await this.credentials.upsertForIntegration({
        workspaceId,
        integrationId: existing.id,
        provider,
        name,
        secrets,
      });
    }

    return this.toSafe(updated);
  }

  // ==========================================================================
  // DELETE
  // ==========================================================================

  async remove(
    workspaceId: string,
    idOrSlug: string,
  ): Promise<{ id: string; deleted: true }> {
    const existing = await this.resolveOrThrow(workspaceId, idOrSlug);

    // The credential relation is onDelete: SetNull, so remove credentials
    // explicitly to avoid leaving orphaned encrypted blobs behind. Any
    // in-flight OAuth state for this integration is cleaned up too.
    await this.prisma.$transaction([
      this.prisma.integrationCredential.deleteMany({
        where: { workspaceId, integrationId: existing.id },
      }),
      this.prisma.oAuthState.deleteMany({
        where: { workspaceId, integrationId: existing.id },
      }),
      this.prisma.integration.deleteMany({
        where: { id: existing.id, workspaceId },
      }),
    ]);

    return { id: existing.id, deleted: true };
  }

  // ==========================================================================
  // CONNECTION TEST
  // ==========================================================================

  async test(
    workspaceId: string,
    idOrSlug: string,
    dto: TestIntegrationDto,
  ): Promise<IntegrationTestResult> {
    const existing = await this.resolveOrThrow(workspaceId, idOrSlug);
    const provider = existing.provider as IntegrationProvider;

    // Gmail is OAuth-backed: the real connection test refreshes the token
    // and calls Google with the stored credential.
    if (provider === 'gmail' && this.gmailOAuth) {
      const gmail = await this.gmailOAuth.testConnection(
        workspaceId,
        existing.id,
        existing.name,
      );
      const nextStatus = gmail.ok
        ? INTEGRATION_STATUS.connected
        : gmail.code === 'NOT_CONFIGURED' || gmail.code === 'MISSING_CREDENTIAL'
          ? existing.status
          : INTEGRATION_STATUS.error;
      return {
        integrationId: existing.id,
        provider,
        ok: gmail.ok,
        status: nextStatus,
        code: gmail.code,
        message: gmail.message,
        detail: gmail.detail,
        checkedAt: new Date().toISOString(),
      };
    }

    const secrets =
      (await this.credentials.getDecryptedForIntegration(
        workspaceId,
        existing.id,
      )) ?? {};

    const result = await this.probes.probe(
      provider,
      this.asRecord(existing.config),
      secrets,
      { timeoutMs: dto?.timeoutMs },
    );

    // Only a definitive failure flips status to `error`; an inconclusive
    // result (e.g. Gmail not supported yet) leaves the current status.
    let nextStatus = existing.status;
    if (result.ok) {
      nextStatus = INTEGRATION_STATUS.connected;
    } else if (
      result.code === 'AUTH_FAILED' ||
      result.code === 'UNREACHABLE' ||
      result.code === 'TIMEOUT' ||
      result.code === 'BLOCKED' ||
      result.code === 'MISSING_CREDENTIAL' ||
      result.code === 'MISSING_CONFIG'
    ) {
      nextStatus = INTEGRATION_STATUS.error;
    }

    if (nextStatus !== existing.status) {
      await this.prisma.integration.update({
        where: { id: existing.id },
        data: { status: nextStatus },
      });
    }

    return {
      integrationId: existing.id,
      provider,
      ok: result.ok,
      status: nextStatus,
      code: result.code,
      message: result.message,
      detail: result.detail,
      checkedAt: new Date().toISOString(),
    };
  }

  // ==========================================================================
  // internals
  // ==========================================================================

  private assertProvider(value: string): IntegrationProvider {
    if (!isSupportedProvider(value)) {
      throw new BadRequestException(
        `Unsupported provider "${value}". Supported: ${SUPPORTED_PROVIDERS.join(
          ', ',
        )}`,
      );
    }
    return value;
  }

  /**
   * Validate a raw config against the provider's config DTO, then split it
   * into non-secret config + secret payload.
   */
  private validateAndSplit(
    provider: IntegrationProvider,
    rawConfig: Record<string, unknown> | undefined,
  ): { config: Record<string, unknown>; secrets: Record<string, string> } {
    const pruned = this.pruneEmpty(rawConfig ?? {});

    const DtoCtor = PROVIDER_CONFIG_DTO[provider];
    const instance = plainToInstance(DtoCtor, pruned, {
      enableImplicitConversion: true,
    });
    const errors = validateSync(instance as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });

    if (errors.length > 0) {
      throw new BadRequestException({
        message: flattenValidationErrors(errors),
        error: 'Invalid integration configuration',
        statusCode: 400,
      });
    }

    // Split from the validated + type-coerced instance so persisted config
    // has consistent types (e.g. numeric `port`) and no stray keys.
    const normalized = this.pruneEmpty(
      instanceToPlain(instance) as Record<string, unknown>,
    );
    return splitProviderConfig(provider, normalized);
  }

  private withDefaultMetadata(
    provider: IntegrationProvider,
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    const meta = DEFAULT_METADATA[provider];
    return {
      category: meta.category,
      description: meta.description,
      ...config,
    };
  }

  private pruneEmpty(input: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      out[key] = value;
    }
    return out;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private async resolveOrThrow(workspaceId: string, idOrSlug: string) {
    const row = await this.resolve(workspaceId, idOrSlug, {
      allowMissingSlug: false,
    });
    if (!row) {
      throw new NotFoundException('Integration not found');
    }
    return row;
  }

  /**
   * Resolve an id-or-slug to a workspace-owned Integration row.
   * UUID -> exact row. Slug -> the workspace's first connection for that
   * provider. Returns null when nothing matches (callers decide whether
   * that is a 404 or a synthetic catalog entry).
   */
  private async resolve(
    workspaceId: string,
    idOrSlug: string,
    opts: { allowMissingSlug: boolean },
  ) {
    if (UUID_RE.test(idOrSlug)) {
      return this.prisma.integration.findFirst({
        where: { id: idOrSlug, workspaceId },
      });
    }

    if (isSupportedProvider(idOrSlug)) {
      const row = await this.prisma.integration.findFirst({
        where: { workspaceId, provider: idOrSlug },
        orderBy: { createdAt: 'asc' },
      });
      if (row || opts.allowMissingSlug) {
        return row;
      }
      return null;
    }

    if (opts.allowMissingSlug) {
      throw new NotFoundException('Integration not found');
    }
    return null;
  }

  private async toSafe(row: {
    id: string;
    workspaceId: string;
    provider: string;
    name: string;
    status: string;
    config: unknown;
    createdAt?: Date;
    updatedAt?: Date;
  }): Promise<SafeIntegration> {
    const provider = row.provider;
    const meta = isSupportedProvider(provider)
      ? DEFAULT_METADATA[provider]
      : undefined;

    const config = this.asRecord(row.config);
    // Guarantee the UI always has category/description without persisting
    // anything new, and strip anything secret-shaped defensively.
    const safeConfig = redactSecrets({
      category: meta?.category,
      description: meta?.description,
      ...config,
    });

    return {
      id: row.id,
      workspaceId: row.workspaceId,
      provider,
      name: row.name,
      status: row.status,
      config: safeConfig,
      hasCredential: await this.credentials.hasCredentialForIntegration(
        row.workspaceId,
        row.id,
      ),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

// ---------------------------------------------------------------------------
// Legacy defensive redaction. New credential paths never put secrets in
// `Integration.config`; this only guards against pre-Step-2 rows.
// ---------------------------------------------------------------------------

const SECRET_KEY_RE =
  /secret|token|password|pass|credential|client_secret|secret_key|private_key|api[_-]?key|connection[_-]?string/i;

function redactSecrets(input: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!input || typeof input !== 'object') {
    return out;
  }
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value === undefined) {
      continue;
    }
    if (SECRET_KEY_RE.test(key)) {
      out[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redactSecrets(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function flattenValidationErrors(errors: ValidationError[]): string[] {
  const messages: string[] = [];
  const walk = (list: ValidationError[]) => {
    for (const err of list) {
      if (err.constraints) {
        messages.push(...Object.values(err.constraints));
      }
      if (err.children && err.children.length > 0) {
        walk(err.children);
      }
    }
  };
  walk(errors);
  return messages.length > 0 ? messages : ['Invalid integration configuration'];
}
