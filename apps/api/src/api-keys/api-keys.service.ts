import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import {
  ADMIN_ROLES,
  WorkspaceAccessService,
} from '../workspace/workspace-access.service';
import type { CreateApiKeyDto } from './dto/api-keys.dto';

const KEY_PREFIX = 'awf_';

/** sha256 hex of an API key — the only representation ever stored. */
export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export interface PublicApiKey {
  id: string;
  name: string;
  /** e.g. "awf_ab12…" — enough to recognise, never the full secret. */
  maskedKey: string;
  status: 'Active' | 'Revoked';
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccessService,
  ) {}

  private toPublic(row: {
    id: string;
    name: string;
    prefix: string;
    createdAt: Date;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
  }): PublicApiKey {
    return {
      id: row.id,
      name: row.name,
      maskedKey: `${row.prefix}${'•'.repeat(6)}`,
      status: row.revokedAt ? 'Revoked' : 'Active',
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      revokedAt: row.revokedAt,
    };
  }

  async list(workspaceId: string, userId: string): Promise<PublicApiKey[]> {
    await this.access.assertMember(workspaceId, userId);
    const rows = await this.prisma.apiKey.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toPublic(r));
  }

  /** Returns the plaintext key ONCE. It is never retrievable afterwards. */
  async create(
    workspaceId: string,
    userId: string,
    dto: CreateApiKeyDto,
  ): Promise<PublicApiKey & { key: string }> {
    await this.access.assertRole(workspaceId, userId, ADMIN_ROLES);

    const secret = randomBytes(24).toString('base64url');
    const key = `${KEY_PREFIX}${secret}`;
    const prefix = key.slice(0, KEY_PREFIX.length + 4);

    const row = await this.prisma.apiKey.create({
      data: {
        workspaceId,
        name: dto.name.trim(),
        prefix,
        hashedKey: hashApiKey(key),
        createdById: userId,
      },
    });

    return { ...this.toPublic(row), key };
  }

  async revoke(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<PublicApiKey[]> {
    await this.access.assertRole(workspaceId, userId, ADMIN_ROLES);
    const row = await this.prisma.apiKey.findFirst({
      where: { id, workspaceId },
    });
    if (!row) throw new NotFoundException('API key not found');
    if (!row.revokedAt) {
      await this.prisma.apiKey.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
    }
    return this.list(workspaceId, userId);
  }

  async revokeAll(
    workspaceId: string,
    userId: string,
  ): Promise<PublicApiKey[]> {
    await this.access.assertRole(workspaceId, userId, ADMIN_ROLES);
    await this.prisma.apiKey.updateMany({
      where: { workspaceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return this.list(workspaceId, userId);
  }
}
