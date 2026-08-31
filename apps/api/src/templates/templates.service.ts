import { Injectable, NotFoundException } from '@nestjs/common';
import type { NodeType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { WorkflowsService } from '../workflows/workflows.service';

export interface TemplateSummary {
  id: string;
  workflowId: string;
  name: string;
  description: string;
  category: string;
  featured: boolean;
  nodeCount: number;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateDetail extends TemplateSummary {
  nodePreview: Array<{ label: string; type: string }>;
  capabilities: string[];
}

const CAPABILITY_RULES: Array<{ label: string; types: NodeType[] }> = [
  { label: 'Trigger handling', types: ['MANUAL_TRIGGER', 'WEBHOOK'] },
  { label: 'AI reasoning', types: ['AI_PROMPT', 'AI_AGENT'] },
  { label: 'Conditional branching', types: ['CONDITION'] },
  {
    label: 'External integrations',
    types: ['HTTP_REQUEST', 'GMAIL', 'SLACK', 'POSTGRES'],
  },
  {
    label: 'Structured output',
    types: ['JSON_TRANSFORM', 'STRUCTURED_EXTRACT', 'OUTPUT'],
  },
];

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: WorkflowsService,
  ) {}

  /** Latest version's node rows for a source workflow (empty if none). */
  private async sourceNodes(workflowId: string) {
    const version = await this.prisma.workflowVersion.findFirst({
      where: { workflowId },
      orderBy: { version: 'desc' },
      include: {
        nodes: { orderBy: { createdAt: 'asc' } },
      },
    });
    return version?.nodes ?? [];
  }

  async list(workspaceId: string): Promise<TemplateSummary[]> {
    const rows = await this.prisma.workflowTemplate.findMany({
      where: { workspaceId },
      orderBy: [{ featured: 'desc' }, { usageCount: 'desc' }, { createdAt: 'asc' }],
    });

    return Promise.all(
      rows.map(async (t) => ({
        id: t.id,
        workflowId: t.workflowId,
        name: t.name,
        description: t.description ?? '',
        category: t.category,
        featured: t.featured,
        nodeCount: (await this.sourceNodes(t.workflowId)).length,
        usageCount: t.usageCount,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    );
  }

  async get(workspaceId: string, id: string): Promise<TemplateDetail> {
    // Scoped by workspaceId — a template from another workspace behaves as
    // if it does not exist (no existence leak).
    const t = await this.prisma.workflowTemplate.findFirst({
      where: { id, workspaceId },
    });
    if (!t) throw new NotFoundException('Template not found');

    const nodes = await this.sourceNodes(t.workflowId);
    const presentTypes = new Set(nodes.map((n) => n.type));
    const capabilities = CAPABILITY_RULES.filter((rule) =>
      rule.types.some((type) => presentTypes.has(type)),
    ).map((rule) => rule.label);

    return {
      id: t.id,
      workflowId: t.workflowId,
      name: t.name,
      description: t.description ?? '',
      category: t.category,
      featured: t.featured,
      nodeCount: nodes.length,
      usageCount: t.usageCount,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      nodePreview: nodes.map((n) => ({ label: n.label, type: n.type })),
      capabilities,
    };
  }

  /**
   * Create a NEW workflow in the caller's workspace from the template's
   * source workflow. The source workflow is never mutated. `usageCount`
   * is incremented (a real persisted counter).
   */
  async use(
    workspaceId: string,
    id: string,
  ): Promise<{ workflowId: string; versionId: string }> {
    const t = await this.prisma.workflowTemplate.findFirst({
      where: { id, workspaceId },
    });
    if (!t) throw new NotFoundException('Template not found');

    const created = await this.workflows.cloneFromWorkflow(t.workflowId, {
      name: t.name,
      description: t.description,
    });

    await this.prisma.workflowTemplate.update({
      where: { id: t.id },
      data: { usageCount: { increment: 1 } },
    });

    return created;
  }
}
