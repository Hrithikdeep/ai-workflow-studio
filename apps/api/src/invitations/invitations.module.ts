import { Module } from '@nestjs/common';

import { WorkspaceModule } from '../workspace/workspace.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [WorkspaceModule],
  controllers: [InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
