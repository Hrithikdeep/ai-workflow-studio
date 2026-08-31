import { Module } from '@nestjs/common';

import { WorkspaceModule } from '../workspace/workspace.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [WorkspaceModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
