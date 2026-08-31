import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ExecutionStatus } from '@prisma/client';

import { ExecutionsService } from './executions.service';
import { Workspace } from '../common/decorators/workspace.decorator';

class RunExecutionDto {
  workflowId!: string;
  workflowVersionId?: string;
  triggerType?: string;
  input?: Record<string, unknown>;
  variables?: Record<string, unknown>;
}

@Controller('executions')
export class ExecutionsController {
  constructor(
    private readonly executionsService: ExecutionsService,
  ) {}

  @Get()
  findAll(
    @Query('status') status?: ExecutionStatus,
    @Query('workflowId') workflowId?: string,
    @Query('workflowVersionId') workflowVersionId?: string,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe)
    skip = 0,
    @Query('take', new DefaultValuePipe(50), ParseIntPipe)
    take = 50,
  ) {
    return this.executionsService.findAll({
      status,
      workflowId,
      workflowVersionId,
      skip,
      take,
    });
  }

  @Post('run')
  run(
    @Body() dto: RunExecutionDto,
    // Workspace of the authenticated caller — passed to the engine so
    // integration-backed nodes resolve workspace-scoped credentials.
    @Workspace() workspaceId: string,
  ) {
    return this.executionsService.runWorkflow(
      dto.workflowId,
      dto.workflowVersionId,
      dto.input ?? {},
      dto.triggerType ?? 'MANUAL',
      dto.variables ?? {},
      workspaceId,
    );
  }

  // Declared before `:id` so "stats" is not treated as an execution id.
  @Get('stats')
  stats() {
    return this.executionsService.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.executionsService.findOne(id);
  }

  // Deletes ONLY this execution record (its ExecutionStep rows cascade). The
  // workflow, workflow version, nodes, integrations, credentials, variables
  // and all other executions are left untouched.
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.executionsService.remove(id);
  }
}
