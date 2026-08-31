import { Module } from '@nestjs/common';

import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { WorkspaceAccessService } from './workspace-access.service';

@Module({
  controllers: [WorkspaceController],
  providers: [WorkspaceService, WorkspaceAccessService],
  exports: [WorkspaceAccessService],
})
export class WorkspaceModule {}
