import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { Workspace } from '../common/decorators/workspace.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { WorkspaceService } from './workspace.service';
import { UpdateWorkspaceDto, UpdateMemberRoleDto } from './dto/workspace.dto';

@Controller('workspace')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class WorkspaceController {
  constructor(private readonly service: WorkspaceService) {}

  @Get()
  get(
    @Workspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getSettings(workspaceId, user.id);
  }

  @Patch()
  update(
    @Workspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.service.updateSettings(workspaceId, user.id, dto);
  }

  @Get('members')
  members(
    @Workspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listMembers(workspaceId, user.id);
  }

  @Patch('members/:userId')
  updateMemberRole(
    @Workspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.service.updateMemberRole(
      workspaceId,
      user.id,
      targetUserId,
      dto,
    );
  }

  @Delete('members/:userId')
  removeMember(
    @Workspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') targetUserId: string,
  ) {
    return this.service.removeMember(workspaceId, user.id, targetUserId);
  }
}
