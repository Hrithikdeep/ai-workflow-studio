import { ForbiddenException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export const WORKSPACE_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Roles allowed to change workspace settings, members, invites, and API keys. */
export const ADMIN_ROLES: WorkspaceRole[] = ['owner', 'admin'];

/**
 * Server-side authorization helper for workspace-scoped resources. Every
 * check reads the caller's own `Membership` row — request-supplied ids are
 * never trusted for authorization.
 */
@Injectable()
export class WorkspaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getRole(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceRole | null> {
    const membership = await this.prisma.membership.findFirst({
      where: { workspaceId, userId },
      select: { role: true },
    });
    return (membership?.role as WorkspaceRole) ?? null;
  }

  /** Throws 403 unless the user is a member of the workspace. Returns the role. */
  async assertMember(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceRole> {
    const role = await this.getRole(workspaceId, userId);
    if (!role) {
      throw new ForbiddenException('You are not a member of this workspace');
    }
    return role;
  }

  /** Throws 403 unless the user's role is one of `allowed`. Returns the role. */
  async assertRole(
    workspaceId: string,
    userId: string,
    allowed: readonly WorkspaceRole[],
  ): Promise<WorkspaceRole> {
    const role = await this.assertMember(workspaceId, userId);
    if (!allowed.includes(role)) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }
    return role;
  }

  /** Number of remaining owners if `excludeUserId` were removed/demoted. */
  async ownerCount(workspaceId: string, excludeUserId?: string): Promise<number> {
    return this.prisma.membership.count({
      where: {
        workspaceId,
        role: 'owner',
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
      },
    });
  }
}
