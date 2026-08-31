import {
  Body,
  Controller,
  Get,
  Patch,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { Workspace } from '../common/decorators/workspace.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { UpdateNotificationPreferencesDto } from './dto/notifications.dto';

@Controller('notification-preferences')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  get(
    @Workspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.get(workspaceId, user.id);
  }

  @Patch()
  update(
    @Workspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.service.update(workspaceId, user.id, dto);
  }
}
