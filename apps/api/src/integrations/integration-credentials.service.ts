import { ForbiddenException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

/**
 * Secure store for integration secrets.
 *
 * Secrets are encrypted with {@link CryptoService} (Step 1) and written to
 * `IntegrationCredential.data`. Every method is workspace-scoped: an
 * `integrationId` / credential that belongs to another workspace behaves as
 * if it does not exist.
 *
 * `getDecryptedForIntegration` is the ONLY method that returns plaintext,
 * and it exists solely for trusted backend paths (connection tests now;
 * execution later). It must never be wired into a controller response.
 */
@Injectable()
export class IntegrationCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * Create or replace the encrypted secret payload for an integration.
   * A single credential row per integration is maintained.
   */
  async upsertForIntegration(params: {
    workspaceId: string;
    integrationId: string;
    provider: string;
    name: string;
    secrets: Record<string, string>;
  }): Promise<{ id: string; created: boolean }> {
    const data = this.crypto.encrypt(JSON.stringify(params.secrets));

    const existing = await this.prisma.integrationCredential.findFirst({
      where: {
        workspaceId: params.workspaceId,
        integrationId: params.integrationId,
      },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.integrationCredential.update({
        where: { id: existing.id },
        data: { data, provider: params.provider, name: params.name },
      });
      return { id: existing.id, created: false };
    }

    const created = await this.prisma.integrationCredential.create({
      data: {
        workspaceId: params.workspaceId,
        integrationId: params.integrationId,
        provider: params.provider,
        name: params.name,
        data,
      },
      select: { id: true },
    });
    return { id: created.id, created: true };
  }

  /** True when an encrypted credential exists for the integration. */
  async hasCredentialForIntegration(
    workspaceId: string,
    integrationId: string,
  ): Promise<boolean> {
    const count = await this.prisma.integrationCredential.count({
      where: { workspaceId, integrationId },
    });
    return count > 0;
  }

  /**
   * INTERNAL ONLY. Returns the decrypted secret payload for trusted backend
   * use (connection test / execution). Never expose the result through an
   * API response.
   */
  async getDecryptedForIntegration(
    workspaceId: string,
    integrationId: string,
  ): Promise<Record<string, unknown> | null> {
    const row = await this.prisma.integrationCredential.findFirst({
      where: { workspaceId, integrationId },
    });
    if (!row) {
      return null;
    }
    // Defence in depth — the query is already workspace-scoped.
    if (row.workspaceId !== workspaceId) {
      throw new ForbiddenException('Credential belongs to another workspace');
    }

    const json = this.crypto.decrypt(row.data);
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  }

  /** Delete every credential belonging to an integration in this workspace. */
  async deleteForIntegration(
    workspaceId: string,
    integrationId: string,
  ): Promise<number> {
    const result = await this.prisma.integrationCredential.deleteMany({
      where: { workspaceId, integrationId },
    });
    return result.count;
  }
}
