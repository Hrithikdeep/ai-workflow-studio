import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { VariablesService } from './variables.service';
import { Workspace } from '../common/decorators/workspace.decorator';

import type { CreateVariableDto } from './dto/create-variable.dto';
import type { UpdateVariableDto } from './dto/update-variable.dto';

@Controller('variables')
export class VariablesController {
  constructor(private readonly service: VariablesService) {}

  @Get()
  list(
    @Workspace() workspaceId: string,
    @Query('search') search?: string,
    @Query('environment') environment?: string,
    @Query('type') type?: string,
  ) {
    return this.service
      .list(workspaceId, {
        search,
        environment,
        type,
      })
      .then((rows) =>
        rows.map((r) => ({
          ...r,
          value: r.type === 'Secret' ? '••••••••' : r.value,
        })),
      );
  }

  @Get(':id')
  get(@Workspace() workspaceId: string, @Param('id') id: string) {
    return this.service.get(workspaceId, id);
  }

  @Post()
  create(@Workspace() workspaceId: string, @Body() dto: CreateVariableDto) {
    return this.service.create(workspaceId, dto);
  }

  @Patch(':id')
  update(
    @Workspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateVariableDto,
  ) {
    return this.service.update(workspaceId, id, dto);
  }

  @Delete(':id')
  remove(@Workspace() workspaceId: string, @Param('id') id: string) {
    return this.service.remove(workspaceId, id);
  }
}
