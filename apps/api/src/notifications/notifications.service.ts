import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceAccessService } from '../workspace/workspace-access.service';
import type { UpdateNotificationPreferencesDto } from './dto/notifications.dto';

export interface NotificationPreferencesResult {
  preferences: Record<string, unknown> | null;
  updatedAt: Date | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccessService,
  ) {}

  async get(
    workspaceId: string,
    userId: string,
  ): Promise<NotificationPreferencesResult> {
    await this.access.assertMember(workspaceId, userId);
    const row = await this.prisma.notificationPreference.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    return {
      preferences: (row?.preferences as Record<string, unknown> | undefined) ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  async update(
    workspaceId: string,
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResult> {
    await this.access.assertMember(workspaceId, userId);
    const preferences = dto.preferences as Prisma.InputJsonValue;
    const row = await this.prisma.notificationPreference.upsert({
      where: { userId_workspaceId: { userId, workspaceId } },
      create: { userId, workspaceId, preferences },
      update: { preferences },
    });
    return {
      preferences: row.preferences as Record<string, unknown>,
      updatedAt: row.updatedAt,
    };
  }
}
