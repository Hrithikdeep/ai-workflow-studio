import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async signup(email: string, password: string, name?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('Email already registered');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({ data: { email, name, password: passwordHash } });

    // create a default workspace for this user
    const workspace = await this.prisma.workspace.create({ data: { name: `${name ?? email}'s workspace`, slug: `${email.split('@')[0]}-${Date.now()}` } });
    await this.prisma.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: 'owner', isDefault: true } });

    const token = this.signToken(user.id);
    await this.prisma.session.create({ data: { userId: user.id, token } });

    return { user, token, workspaceId: workspace.id };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const token = this.signToken(user.id);
    await this.prisma.session.create({ data: { userId: user.id, token } });

    return { user, token };
  }

  async logout(token: string) {
    if (!token) return;
    await this.prisma.session.deleteMany({ where: { token } });
  }

  signToken(userId: string) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not configured');
    return jwt.sign({ sub: userId }, secret, { expiresIn: '30d' });
  }

  /** Update the authenticated user's own profile. Never returns the password. */
  async updateProfile(
    userId: string,
    patch: { name?: string; email?: string },
  ) {
    const data: { name?: string; email?: string } = {};

    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new BadRequestException('Name cannot be empty');
      data.name = name;
    }

    if (patch.email !== undefined) {
      const email = patch.email.trim().toLowerCase();
      const clash = await this.prisma.user.findUnique({ where: { email } });
      if (clash && clash.id !== userId) {
        throw new BadRequestException('That email address is already in use');
      }
      data.email = email;
    }

    const user = await this.prisma.user.update({ where: { id: userId }, data });
    return { id: user.id, email: user.email, name: user.name };
  }

  async listSessions(userId: string, currentToken?: string) {
    const rows = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    // The raw token is a bearer credential and is NEVER returned.
    return rows.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current: Boolean(currentToken) && s.token === currentToken,
    }));
  }

  async revokeOtherSessions(userId: string, currentToken?: string) {
    const result = await this.prisma.session.deleteMany({
      where: {
        userId,
        ...(currentToken ? { token: { not: currentToken } } : {}),
      },
    });
    return { revoked: result.count };
  }

  /** Revoke a single session the caller owns. */
  async revokeSession(userId: string, sessionId: string) {
    const result = await this.prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });
    return { revoked: result.count };
  }

  async revokeAllSessions(userId: string) {
    const result = await this.prisma.session.deleteMany({ where: { userId } });
    return { revoked: result.count };
  }
}
