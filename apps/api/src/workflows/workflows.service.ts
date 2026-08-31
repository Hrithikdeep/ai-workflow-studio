import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { SaveGraphDto } from './dto/save-graph.dto';
import { GraphResponseDto } from './dto/graph.dto';

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // CREATE WORKFLOW
  // ============================================================

  async create(dto: CreateWorkflowDto) {
    return this.prisma.$transaction(async (tx) => {
      const workflow = await tx.workflow.create({
        data: {
          name: dto.name,
          description: dto.description,
          status: 'DRAFT',
        },
      });

      await tx.workflowVersion.create({
        data: {
          workflowId: workflow.id,
          version: 1,
          isPublished: false,
        },
      });

      return workflow;
    });
  }

  // ============================================================
  // GET ALL WORKFLOWS
  // ============================================================

  async findAll() {
    return this.prisma.workflow.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // ============================================================
  // GET SINGLE WORKFLOW
  // ============================================================

  async findOne(id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: {
        id,
      },
      include: {
        versions: {
          orderBy: {
            version: 'desc',
          },
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return workflow;
  }

  // ============================================================
  // UPDATE WORKFLOW
  // ============================================================

  async update(id: string, dto: UpdateWorkflowDto) {
    const workflow = await this.prisma.workflow.findUnique({
      where: {
        id,
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return this.prisma.workflow.update({
      where: {
        id,
      },
      data: dto,
    });
  }

  // ============================================================
  // DELETE WORKFLOW
  // ============================================================

  async remove(id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: {
        id,
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return this.prisma.workflow.delete({
      where: {
        id,
      },
    });
  }

  // ============================================================
  // GET WORKFLOW VERSIONS
  // ============================================================

  async getVersions(workflowId: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: {
        id: workflowId,
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return this.prisma.workflowVersion.findMany({
      where: {
        workflowId,
      },
      orderBy: {
        version: 'desc',
      },
    });
  }

  // ============================================================
  // GET LATEST DRAFT VERSION
  // ============================================================

  async getLatestDraftVersion(workflowId: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: {
        id: workflowId,
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const version = await this.prisma.workflowVersion.findFirst({
      where: {
        workflowId,
        isPublished: false,
      },
      orderBy: {
        version: 'desc',
      },
    });

    if (!version) {
      throw new NotFoundException(
        'Draft workflow version not found',
      );
    }

    return version;
  }

  // ============================================================
  // CREATE NEW VERSION
  //
  // Creates a new draft version by cloning the latest version.
  // ============================================================

  async createVersion(workflowId: string) {
    return this.prisma.$transaction(async (tx) => {
      const workflow = await tx.workflow.findUnique({
        where: {
          id: workflowId,
        },
      });

      if (!workflow) {
        throw new NotFoundException('Workflow not found');
      }

      const latest = await tx.workflowVersion.findFirst({
        where: {
          workflowId,
        },
        orderBy: {
          version: 'desc',
        },
        include: {
          nodes: true,
          edges: true,
        },
      });

      const nextVersion = latest
        ? latest.version + 1
        : 1;

      const newVersion =
        await tx.workflowVersion.create({
          data: {
            workflowId,
            version: nextVersion,
            isPublished: false,
          },
        });

      // No previous version exists.
      if (!latest) {
        return newVersion;
      }

      // Map old node IDs -> new node IDs.
      const nodeIdMap = new Map<string, string>();

      // ----------------------------------------------------------
      // CLONE NODES
      // ----------------------------------------------------------

      for (const node of latest.nodes) {
        const createdNode = await tx.node.create({
          data: {
            workflowVersionId: newVersion.id,
            type: node.type,
            label: node.label,
            positionX: node.positionX,
            positionY: node.positionY,
            config:
              (node.config ??
                Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        });

        nodeIdMap.set(
          node.id,
          createdNode.id,
        );
      }

      // ----------------------------------------------------------
      // CLONE EDGES
      // ----------------------------------------------------------

      for (const edge of latest.edges) {
        const sourceNodeId =
          nodeIdMap.get(edge.sourceNodeId);

        const targetNodeId =
          nodeIdMap.get(edge.targetNodeId);

        if (!sourceNodeId || !targetNodeId) {
          throw new BadRequestException(
            `Unable to clone edge ${edge.id}: node mapping missing`,
          );
        }

        await tx.edge.create({
          data: {
            workflowVersionId: newVersion.id,
            sourceNodeId,
            targetNodeId,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
          },
        });
      }

      // A workflow with a new editable version is a draft again.
      await tx.workflow.update({
        where: {
          id: workflowId,
        },
        data: {
          status: 'DRAFT',
        },
      });

      return newVersion;
    });
  }

  // ============================================================
  // CLONE INTO A NEW WORKFLOW
  //
  // Creates a brand-new Workflow (draft, version 1) whose graph is a copy
  // of `sourceWorkflowId`'s latest version. The source workflow is only
  // read — never modified. Reuses the same node/edge-cloning pattern as
  // `createVersion`. Used by the Templates feature.
  // ============================================================

  async cloneFromWorkflow(
    sourceWorkflowId: string,
    opts: { name?: string; description?: string | null } = {},
  ): Promise<{ workflowId: string; versionId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.workflow.findUnique({
        where: { id: sourceWorkflowId },
      });
      if (!source) {
        throw new NotFoundException('Source workflow not found');
      }

      const sourceVersion = await tx.workflowVersion.findFirst({
        where: { workflowId: sourceWorkflowId },
        orderBy: { version: 'desc' },
        include: { nodes: true, edges: true },
      });

      const newWorkflow = await tx.workflow.create({
        data: {
          name: opts.name?.trim() || source.name,
          description:
            opts.description !== undefined
              ? opts.description
              : source.description,
          status: 'DRAFT',
        },
      });

      const newVersion = await tx.workflowVersion.create({
        data: {
          workflowId: newWorkflow.id,
          version: 1,
          isPublished: false,
        },
      });

      if (sourceVersion) {
        const nodeIdMap = new Map<string, string>();

        for (const node of sourceVersion.nodes) {
          const createdNode = await tx.node.create({
            data: {
              workflowVersionId: newVersion.id,
              type: node.type,
              label: node.label,
              positionX: node.positionX,
              positionY: node.positionY,
              config: (node.config ??
                Prisma.JsonNull) as Prisma.InputJsonValue,
            },
          });
          nodeIdMap.set(node.id, createdNode.id);
        }

        for (const edge of sourceVersion.edges) {
          const sourceNodeId = nodeIdMap.get(edge.sourceNodeId);
          const targetNodeId = nodeIdMap.get(edge.targetNodeId);
          if (!sourceNodeId || !targetNodeId) {
            throw new BadRequestException(
              `Unable to clone edge ${edge.id}: node mapping missing`,
            );
          }
          await tx.edge.create({
            data: {
              workflowVersionId: newVersion.id,
              sourceNodeId,
              targetNodeId,
              sourceHandle: edge.sourceHandle,
              targetHandle: edge.targetHandle,
            },
          });
        }
      }

      return { workflowId: newWorkflow.id, versionId: newVersion.id };
    });
  }

  // ============================================================
  // PUBLISH VERSION
  // ============================================================

  async publishVersion(
    workflowId: string,
    versionId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const workflow =
        await tx.workflow.findUnique({
          where: {
            id: workflowId,
          },
        });

      if (!workflow) {
        throw new NotFoundException(
          'Workflow not found',
        );
      }

      const version =
        await tx.workflowVersion.findFirst({
          where: {
            id: versionId,
            workflowId,
          },
        });

      if (!version) {
        throw new NotFoundException(
          'Workflow version not found',
        );
      }

      // ----------------------------------------------------------
      // UNPUBLISH ALL OTHER VERSIONS
      // ----------------------------------------------------------

      await tx.workflowVersion.updateMany({
        where: {
          workflowId,
          id: {
            not: versionId,
          },
        },
        data: {
          isPublished: false,
        },
      });

      // ----------------------------------------------------------
      // PUBLISH SELECTED VERSION
      // ----------------------------------------------------------

      const publishedVersion =
        await tx.workflowVersion.update({
          where: {
            id: versionId,
          },
          data: {
            isPublished: true,
          },
        });

      // ----------------------------------------------------------
      // IMPORTANT:
      // Update parent workflow status too.
      // ----------------------------------------------------------

      await tx.workflow.update({
        where: {
          id: workflowId,
        },
        data: {
          status: 'PUBLISHED',
        },
      });

      return publishedVersion;
    });
  }

  // ============================================================
  // SAVE GRAPH
  // ============================================================

  async saveGraph(
    versionId: string,
    dto: SaveGraphDto,
  ) {
    // ----------------------------------------------------------
    // NODE TYPE NORMALIZATION
    // ----------------------------------------------------------

    const normalizeNodeType = (
      raw?: string | null,
    ) => {
      if (!raw) {
        return undefined;
      }

      const key = String(raw)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      const map: Record<string, string> = {
        manualtrigger: 'MANUAL_TRIGGER',
        manual: 'MANUAL_TRIGGER',

        webhook: 'WEBHOOK',
        webhooktrigger: 'WEBHOOK',

        httprequest: 'HTTP_REQUEST',

        condition: 'CONDITION',
        conditionnode: 'CONDITION',

        jsontransform: 'JSON_TRANSFORM',

        aiprompt: 'AI_PROMPT',

        aiagent: 'AI_AGENT',

        structuredextract:
          'STRUCTURED_EXTRACT',
        // The editor palette emits `STRUCTURED_EXTRACTION`; map it to the
        // schema enum the same way `postgresql` -> `POSTGRES` below.
        structuredextraction:
          'STRUCTURED_EXTRACT',

        gmail: 'GMAIL',

        slack: 'SLACK',

        postgres: 'POSTGRES',
        postgresql: 'POSTGRES',

        output: 'OUTPUT',
      };

      return map[key];
    };

    // ----------------------------------------------------------
    // NORMALIZED DATA
    // ----------------------------------------------------------

    const normalizedNodes: Array<{
      id: string;
      type: string;
      label: string;
      positionX: number;
      positionY: number;
      config: Prisma.InputJsonValue;
    }> = [];

    const normalizedEdges: Array<{
      id: string;
      sourceNodeId: string;
      targetNodeId: string;
      sourceHandle?: string | null;
      targetHandle?: string | null;
    }> = [];

    // ----------------------------------------------------------
    // VALIDATE NODES
    // ----------------------------------------------------------

    const nodeIds = new Set<string>();

    for (const rawNode of dto.nodes ?? []) {
      const id = rawNode.id;

      if (!id) {
        throw new BadRequestException(
          'Each node must have an id',
        );
      }

      if (nodeIds.has(id)) {
        throw new BadRequestException(
          `Duplicate node id: ${id}`,
        );
      }

      nodeIds.add(id);

      const position =
        (rawNode as any).position;

      const positionX = Number(
        (rawNode as any).positionX ??
          position?.x ??
          0,
      );

      const positionY = Number(
        (rawNode as any).positionY ??
          position?.y ??
          0,
      );

      if (
        !Number.isFinite(positionX) ||
        !Number.isFinite(positionY)
      ) {
        throw new BadRequestException(
          `Invalid position for node ${id}`,
        );
      }

      const rawType =
        (rawNode as any).type ??
        (rawNode as any).data?.type;

      const type =
        normalizeNodeType(rawType);

      if (!type) {
        throw new BadRequestException(
          `Unknown node type for node ${id}: ${rawType}`,
        );
      }

      const config =
        (rawNode as any).config ??
        (rawNode as any).data?.config ??
        {};

      normalizedNodes.push({
        id,
        type,
        label:
          (rawNode as any).label ??
          (rawNode as any).data?.label ??
          'Node',
        positionX,
        positionY,
        config:
          config as Prisma.InputJsonValue,
      });
    }

    // ----------------------------------------------------------
    // VALIDATE EDGES
    // ----------------------------------------------------------

    const edgeIds = new Set<string>();

    for (const rawEdge of dto.edges ?? []) {
      const id = rawEdge.id;

      if (!id) {
        throw new BadRequestException(
          'Each edge must have an id',
        );
      }

      if (edgeIds.has(id)) {
        throw new BadRequestException(
          `Duplicate edge id: ${id}`,
        );
      }

      edgeIds.add(id);

      const source =
        (rawEdge as any).sourceNodeId ??
        (rawEdge as any).source;

      const target =
        (rawEdge as any).targetNodeId ??
        (rawEdge as any).target;

      if (!source || !target) {
        throw new BadRequestException(
          `Edge ${id} must have source and target`,
        );
      }

      if (!nodeIds.has(source)) {
        throw new BadRequestException(
          `Edge ${id} references unknown source node: ${source}`,
        );
      }

      if (!nodeIds.has(target)) {
        throw new BadRequestException(
          `Edge ${id} references unknown target node: ${target}`,
        );
      }

      normalizedEdges.push({
        id,
        sourceNodeId: source,
        targetNodeId: target,
        sourceHandle:
          (rawEdge as any).sourceHandle ??
          null,
        targetHandle:
          (rawEdge as any).targetHandle ??
          null,
      });
    }

    // ----------------------------------------------------------
    // SAVE EVERYTHING IN ONE TRANSACTION
    // ----------------------------------------------------------

    return this.prisma.$transaction(
      async (tx) => {
        const version =
          await tx.workflowVersion.findUnique({
            where: {
              id: versionId,
            },
          });

        if (!version) {
          throw new NotFoundException(
            'Workflow version not found',
          );
        }

        // ------------------------------------------------------
        // DELETE OLD GRAPH
        // ------------------------------------------------------

        await tx.edge.deleteMany({
          where: {
            workflowVersionId: versionId,
          },
        });

        await tx.node.deleteMany({
          where: {
            workflowVersionId: versionId,
          },
        });

        // ------------------------------------------------------
        // CREATE NODES
        // ------------------------------------------------------

        for (const node of normalizedNodes) {
          await tx.node.create({
            data: {
              id: node.id,
              workflowVersionId: versionId,
              type: node.type as any,
              label: node.label,
              positionX: node.positionX,
              positionY: node.positionY,
              config: node.config,
            },
          });
        }

        // ------------------------------------------------------
        // CREATE EDGES
        // ------------------------------------------------------

        for (const edge of normalizedEdges) {
          await tx.edge.create({
            data: {
              id: edge.id,
              workflowVersionId: versionId,
              sourceNodeId:
                edge.sourceNodeId,
              targetNodeId:
                edge.targetNodeId,
              sourceHandle:
                edge.sourceHandle,
              targetHandle:
                edge.targetHandle,
            },
          });
        }

        // Saving means workflow currently has draft changes.
        if (version.isPublished) {
          await tx.workflow.update({
            where: {
              id: version.workflowId,
            },
            data: {
              status: 'DRAFT',
            },
          });
        }

        return {
          success: true,
          versionId,
          nodes: normalizedNodes.length,
          edges: normalizedEdges.length,
        };
      },
    );
  }

  // ============================================================
  // GET GRAPH
  // ============================================================

  async getGraph(
    versionId: string,
  ): Promise<GraphResponseDto> {
    const version =
      await this.prisma.workflowVersion.findUnique({
        where: {
          id: versionId,
        },
        include: {
          nodes: {
            orderBy: {
              createdAt: 'asc',
            },
          },
          edges: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });

    if (!version) {
      throw new NotFoundException(
        'Workflow version not found',
      );
    }

    return {
      nodes: version.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        label: node.label,
        positionX: node.positionX,
        positionY: node.positionY,
        config:
          (node.config as Record<string, any>) ??
          {},
      })),

      edges: version.edges.map((edge) => ({
        id: edge.id,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
    };
  }
}