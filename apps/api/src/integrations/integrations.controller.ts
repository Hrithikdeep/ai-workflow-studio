import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { IntegrationsService } from './integrations.service';
import { Workspace } from '../common/decorators/workspace.decorator';

import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { TestIntegrationDto } from './dto/test-integration.dto';

/**
 * All routes are workspace-scoped via `@Workspace()` (populated by the auth
 * middleware in `main.ts`). `:id` accepts either a real Integration UUID or,
 * for backward compatibility, a provider slug (`slack`, `gmail`, …).
 *
 * Validation is applied at controller scope rather than globally: a global
 * ValidationPipe with `forbidNonWhitelisted` would reject the decorator-less
 * class DTOs still used by the workflows/executions controllers.
 */
@Controller('integrations')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Get()
  list(@Workspace() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get(':id')
  get(@Workspace() workspaceId: string, @Param('id') id: string) {
    return this.service.get(workspaceId, id);
  }

  @Post()
  create(
    @Workspace() workspaceId: string,
    @Body() dto: CreateIntegrationDto,
  ) {
    return this.service.create(workspaceId, dto);
  }

  @Patch(':id')
  update(
    @Workspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateIntegrationDto,
  ) {
    return this.service.update(workspaceId, id, dto);
  }

  @Delete(':id')
  remove(@Workspace() workspaceId: string, @Param('id') id: string) {
    return this.service.remove(workspaceId, id);
  }

  @Post(':id/test')
  test(
    @Workspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: TestIntegrationDto,
  ) {
    return this.service.test(workspaceId, id, dto ?? {});
  }
}
