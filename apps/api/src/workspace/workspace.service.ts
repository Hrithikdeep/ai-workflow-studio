import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  ADMIN_ROLES,
  WorkspaceAccessService,
  type WorkspaceRole,
} from './workspace-access.service';
import type { UpdateWorkspaceDto, UpdateMemberRoleDto } from './dto/workspace.dto';

export interface WorkspaceSettings {
  id: string;
  name: string;
  slug: string;
  description: string;
  defaultEnvironment: string;
  defaultTimezone: string;
  defaultVisibility: string;
  role: WorkspaceRole;
}

export interface WorkspaceMember {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  status: 'Active';
  joinedAt: Date;
  isSelf: boolean;
}

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccessService,
  ) {}

  async getSettings(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceSettings> {
    const role = await this.access.assertMember(workspaceId, userId);
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!ws) throw new NotFoundException('Workspace not found');

    return {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      description: ws.description ?? '',
      defaultEnvironment: ws.defaultEnvironment,
      defaultTimezone: ws.defaultTimezone,
      defaultVisibility: ws.defaultVisibility,
      role,
    };
  }

  async updateSettings(
    workspaceId: string,
    userId: string,
    dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceSettings> {
    await this.access.assertRole(workspaceId, userId, ADMIN_ROLES);

    const data: Record<string, string> = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Workspace name cannot be empty');
      data.name = name;
    }
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.defaultEnvironment !== undefined)
      data.defaultEnvironment = dto.defaultEnvironment;
    if (dto.defaultTimezone !== undefined)
      data.defaultTimezone = dto.defaultTimezone.trim();
    if (dto.defaultVisibility !== undefined)
      data.defaultVisibility = dto.defaultVisibility;

    await this.prisma.workspace.update({ where: { id: workspaceId }, data });
    return this.getSettings(workspaceId, userId);
  }

  async listMembers(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember[]> {
    await this.access.assertMember(workspaceId, userId);

    const memberships = await this.prisma.membership.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return memberships.map((m) => ({
      userId: m.user.id,
      name: m.user.name ?? m.user.email,
      email: m.user.email,
      role: m.role as WorkspaceRole,
      status: 'Active' as const,
      joinedAt: m.createdAt,
      isSelf: m.user.id === userId,
    }));
  }

  async updateMemberRole(
    workspaceId: string,
    callerId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<WorkspaceMember[]> {
    await this.access.assertRole(workspaceId, callerId, ADMIN_ROLES);

    const target = await this.prisma.membership.findFirst({
      where: { workspaceId, userId: targetUserId },
    });
    if (!target) throw new NotFoundException('Member not found');

    if (
      target.role === 'owner' &&
      dto.role !== 'owner' &&
      (await this.access.ownerCount(workspaceId, targetUserId)) === 0
    ) {
      throw new BadRequestException(
        'Cannot change the role of the last remaining owner',
      );
    }

    await this.prisma.membership.update({
      where: { id: target.id },
      data: { role: dto.role },
    });
    return this.listMembers(workspaceId, callerId);
  }

  async removeMember(
    workspaceId: string,
    callerId: string,
    targetUserId: string,
  ): Promise<WorkspaceMember[]> {
    await this.access.assertRole(workspaceId, callerId, ADMIN_ROLES);

    if (targetUserId === callerId) {
      throw new BadRequestException(
        'You cannot remove yourself from the workspace',
      );
    }

    const target = await this.prisma.membership.findFirst({
      where: { workspaceId, userId: targetUserId },
    });
    if (!target) throw new NotFoundException('Member not found');

    if (
      target.role === 'owner' &&
      (await this.access.ownerCount(workspaceId, targetUserId)) === 0
    ) {
      throw new BadRequestException('Cannot remove the last remaining owner');
    }

    await this.prisma.membership.delete({ where: { id: target.id } });
    return this.listMembers(workspaceId, callerId);
  }
}
