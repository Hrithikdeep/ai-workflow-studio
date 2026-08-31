import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VariableType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    code?: string;
    message?: string;
  };

  return (
    candidate.code === 'P2021' ||
    candidate.code === 'P2032' ||
    (typeof candidate.message === 'string' &&
      /does not exist|not found in the current database|table .* does not exist|incompatible value|expected .* type/i.test(
        candidate.message,
      ))
  );
}

/**
 * Scope filter for a workspace.
 *
 * - With a workspaceId: that workspace's variables plus legacy unscoped
 *   (`workspaceId = null`) variables.
 * - Without one (should not happen for HTTP calls): legacy unscoped only.
 */
function workspaceScope(
  workspaceId: string | undefined,
): Prisma.VariableWhereInput {
  return workspaceId
    ? { OR: [{ workspaceId }, { workspaceId: null }] }
    : { workspaceId: null };
}

@Injectable()
export class VariablesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    workspaceId: string | undefined,
    params: {
      search?: string;
      environment?: string;
      type?: string;
    },
  ) {
    const where: Prisma.VariableWhereInput = { ...workspaceScope(workspaceId) };

    if (params.search) {
      where.name = {
        contains: String(params.search),
        mode: 'insensitive',
      };
    }

    if (params.environment) {
      where.environment = String(params.environment);
    }

    const ALLOWED_TYPES = new Set<VariableType>([
      VariableType.String,
      VariableType.Number,
      VariableType.Boolean,
      VariableType.Secret,
    ]);

    if (params.type && ALLOWED_TYPES.has(String(params.type) as VariableType)) {
      where.type = String(params.type) as VariableType;
    }

    try {
      return await this.prisma.variable.findMany({
        where,
        orderBy: {
          updatedAt: 'desc',
        },
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        return [];
      }

      throw error;
    }
  }

  async get(workspaceId: string | undefined, id: string) {
    const variable = await this.prisma.variable.findFirst({
      where: { id, ...workspaceScope(workspaceId) },
    });

    if (!variable) {
      throw new NotFoundException('Variable not found');
    }

    return variable;
  }

  async create(
    workspaceId: string | undefined,
    data: {
      name: string;
      value: string;
      type: string;
      environment?: string;
    },
  ) {
    const normalizedType = String(data.type) as VariableType;

    if (!Object.values(VariableType).includes(normalizedType)) {
      throw new Error(`Invalid variable type: ${data.type}`);
    }

    return this.prisma.variable.create({
      data: {
        name: data.name,
        value: data.value,
        type: normalizedType,
        environment: data.environment ?? 'Production',
        workspaceId: workspaceId ?? null,
      },
    });
  }

  async update(
    workspaceId: string | undefined,
    id: string,
    data: {
      name?: string;
      value?: string;
      type?: string;
      environment?: string;
    },
  ) {
    const existing = await this.prisma.variable.findFirst({
      where: { id, ...workspaceScope(workspaceId) },
    });

    if (!existing) {
      throw new NotFoundException('Variable not found');
    }

    const normalizedData: {
      name?: string;
      value?: string;
      type?: VariableType;
      environment?: string;
    } = {
      name: data.name,
      value: data.value,
      environment: data.environment,
    };

    if (data.type) {
      const normalizedType = String(data.type) as VariableType;
      if (!Object.values(VariableType).includes(normalizedType)) {
        throw new Error(`Invalid variable type: ${data.type}`);
      }
      normalizedData.type = normalizedType;
    }

    return this.prisma.variable.update({
      where: { id: existing.id },
      data: normalizedData,
    });
  }

  async remove(workspaceId: string | undefined, id: string) {
    const existing = await this.prisma.variable.findFirst({
      where: { id, ...workspaceScope(workspaceId) },
    });

    if (!existing) {
      throw new NotFoundException('Variable not found');
    }

    return this.prisma.variable.delete({
      where: { id: existing.id },
    });
  }
}
