import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';

import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { SaveGraphDto } from './dto/save-graph.dto';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  // ============================================================
  // CREATE WORKFLOW
  // ============================================================

  @Post()
  create(@Body() dto: CreateWorkflowDto) {
    return this.workflowsService.create(dto);
  }

  // ============================================================
  // GET ALL WORKFLOWS
  // ============================================================

  @Get()
  findAll() {
    return this.workflowsService.findAll();
  }

  // ============================================================
  // GET WORKFLOW VERSIONS
  // ============================================================

  @Get(':id/versions')
  getVersions(@Param('id') id: string) {
    return this.workflowsService.getVersions(id);
  }

  // ============================================================
  // CREATE NEW WORKFLOW VERSION
  //
  // Creates a new draft version by cloning the latest version.
  // ============================================================

  @Post(':id/versions')
  createVersion(@Param('id') id: string) {
    return this.workflowsService.createVersion(id);
  }

  // ============================================================
  // PUBLISH WORKFLOW VERSION
  // ============================================================

  @Post(':workflowId/versions/:versionId/publish')
  publishVersion(
    @Param('workflowId') workflowId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.workflowsService.publishVersion(
      workflowId,
      versionId,
    );
  }

  // ============================================================
  // GET WORKFLOW GRAPH
  // ============================================================

  @Get('versions/:versionId/graph')
  getGraph(@Param('versionId') versionId: string) {
    return this.workflowsService.getGraph(versionId);
  }

  // ============================================================
  // SAVE WORKFLOW GRAPH - VERSION SCOPED
  //
  // PUT /workflows/versions/:versionId/graph
  // ============================================================

  @Put('versions/:versionId/graph')
  async saveGraph(
    @Param('versionId') versionId: string,
    @Body() dto: SaveGraphDto,
  ) {
    try {
      console.log('[Relay] saveGraph request:', {
        versionId,
        nodes: Array.isArray(dto?.nodes)
          ? dto.nodes.length
          : 0,
        edges: Array.isArray(dto?.edges)
          ? dto.edges.length
          : 0,
      });

      return await this.workflowsService.saveGraph(
        versionId,
        dto,
      );
    } catch (error) {
      console.error(
        '[Relay][ERROR] saveGraph failed:',
        {
          versionId,
          message:
            error instanceof Error
              ? error.message
              : String(error),
          stack:
            error instanceof Error
              ? error.stack
              : undefined,
          prismaCode:
            (error as any)?.code ?? null,
          prismaMeta:
            (error as any)?.meta ?? null,
        },
      );

      throw error;
    }
  }

  // ============================================================
  // SAVE WORKFLOW GRAPH - WORKFLOW SCOPED
  //
  // PUT /workflows/:workflowId/graph
  //
  // Frontend sends workflowId.
  // Backend resolves the latest draft version.
  // ============================================================

  @Put(':workflowId/graph')
  async saveGraphForWorkflow(
    @Param('workflowId') workflowId: string,
    @Body() dto: SaveGraphDto,
  ) {
    try {
      console.log(
        '[Relay] saveGraph workflow request:',
        {
          workflowId,
          nodes: Array.isArray(dto?.nodes)
            ? dto.nodes.length
            : 0,
          edges: Array.isArray(dto?.edges)
            ? dto.edges.length
            : 0,
        },
      );

      const version =
        await this.workflowsService.getLatestDraftVersion(
          workflowId,
        );

      if (!version) {
        throw new NotFoundException(
          'Draft workflow version not found',
        );
      }

      console.log(
        '[Relay] resolved draft version:',
        {
          workflowId,
          versionId: version.id,
          version: version.version,
        },
      );

      return await this.workflowsService.saveGraph(
        version.id,
        dto,
      );
    } catch (error) {
      console.error(
        '[Relay][ERROR] saveGraph workflow failed:',
        {
          workflowId,
          message:
            error instanceof Error
              ? error.message
              : String(error),
          stack:
            error instanceof Error
              ? error.stack
              : undefined,
          prismaCode:
            (error as any)?.code ?? null,
          prismaMeta:
            (error as any)?.meta ?? null,
        },
      );

      throw error;
    }
  }

  // ============================================================
  // GET SINGLE WORKFLOW
  // ============================================================

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workflowsService.findOne(id);
  }

  // ============================================================
  // UPDATE WORKFLOW
  // ============================================================

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(id, dto);
  }

  // ============================================================
  // DELETE WORKFLOW
  // ============================================================

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workflowsService.remove(id);
  }
}
