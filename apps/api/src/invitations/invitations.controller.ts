import {
  Body,
  Controller,
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
import { InvitationsService } from './invitations.service';
import {
  AcceptInvitationDto,
  CreateInvitationDto,
} from './dto/invitations.dto';

@Controller('invitations')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class InvitationsController {
  constructor(private readonly service: InvitationsService) {}

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
    @Body() dto: CreateInvitationDto,
  ) {
    return this.service.create(workspaceId, user.id, dto);
  }

  @Post(':id/revoke')
  revoke(
    @Workspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.revoke(workspaceId, user.id, id);
  }

  @Post('accept')
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.service.accept(user.id, user.email, dto);
  }
}
