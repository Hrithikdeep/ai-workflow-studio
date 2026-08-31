import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import {
  ADMIN_ROLES,
  WorkspaceAccessService,
} from '../workspace/workspace-access.service';
import type {
  AcceptInvitationDto,
  CreateInvitationDto,
} from './dto/invitations.dto';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PublicInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  /** Present only on creation so the admin can share it (no mailer yet). */
  token?: string;
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccessService,
  ) {}

  private toPublic(row: {
    id: string;
    email: string;
    role: string;
    status: string;
    createdAt: Date;
    expiresAt: Date;
  }): PublicInvitation {
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  }

  async list(workspaceId: string, userId: string): Promise<PublicInvitation[]> {
    await this.access.assertMember(workspaceId, userId);
    const rows = await this.prisma.invitation.findMany({
      where: { workspaceId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toPublic(r));
  }

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateInvitationDto,
  ): Promise<PublicInvitation> {
    await this.access.assertRole(workspaceId, userId, ADMIN_ROLES);

    const email = dto.email.trim().toLowerCase();

    // Already a member?
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const member = await this.prisma.membership.findFirst({
        where: { workspaceId, userId: existingUser.id },
      });
      if (member) {
        throw new ConflictException(
          'That person is already a member of this workspace',
        );
      }
    }

    const existingInvite = await this.prisma.invitation.findUnique({
      where: { workspaceId_email: { workspaceId, email } },
    });
    if (existingInvite && existingInvite.status === 'pending') {
      throw new ConflictException(
        'An invitation for that email is already pending',
      );
    }

    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const row = existingInvite
      ? await this.prisma.invitation.update({
          where: { id: existingInvite.id },
          data: {
            role: dto.role,
            token,
            status: 'pending',
            invitedById: userId,
            expiresAt,
            createdAt: new Date(),
          },
        })
      : await this.prisma.invitation.create({
          data: {
            workspaceId,
            email,
            role: dto.role,
            token,
            invitedById: userId,
            expiresAt,
          },
        });

    return { ...this.toPublic(row), token };
  }

  async revoke(
    workspaceId: string,
    userId: string,
    invitationId: string,
  ): Promise<PublicInvitation[]> {
    await this.access.assertRole(workspaceId, userId, ADMIN_ROLES);
    const row = await this.prisma.invitation.findFirst({
      where: { id: invitationId, workspaceId },
    });
    if (!row) throw new NotFoundException('Invitation not found');
    await this.prisma.invitation.update({
      where: { id: row.id },
      data: { status: 'revoked' },
    });
    return this.list(workspaceId, userId);
  }

  /** Accept an invitation as the currently authenticated user. */
  async accept(
    userId: string,
    userEmail: string,
    dto: AcceptInvitationDto,
  ): Promise<{ workspaceId: string; role: string }> {
    const invite = await this.prisma.invitation.findUnique({
      where: { token: dto.token },
    });
    if (!invite || invite.status !== 'pending') {
      throw new NotFoundException('This invitation is not valid');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.prisma.invitation.update({
        where: { id: invite.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('This invitation has expired');
    }
    if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new BadRequestException(
        'This invitation was issued for a different email address',
      );
    }

    const existing = await this.prisma.membership.findFirst({
      where: { workspaceId: invite.workspaceId, userId },
    });
    if (!existing) {
      await this.prisma.membership.create({
        data: {
          workspaceId: invite.workspaceId,
          userId,
          role: invite.role,
          isDefault: false,
        },
      });
    }
    await this.prisma.invitation.update({
      where: { id: invite.id },
      data: { status: 'accepted' },
    });

    return { workspaceId: invite.workspaceId, role: invite.role };
  }
}
