import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { Workspace } from '../common/decorators/workspace.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/api-keys.dto';

@Controller('api-keys')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Get()
  list(
    @Workspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.list(workspaceId, user.id);
  }

  @Post()
  create(
    @Workspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.service.create(workspaceId, user.id, dto);
  }

  @Post('revoke-all')
  revokeAll(
    @Workspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.revokeAll(workspaceId, user.id);
  }

  @Delete(':id')
  revoke(
    @Workspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.revoke(workspaceId, user.id, id);
  }
}
