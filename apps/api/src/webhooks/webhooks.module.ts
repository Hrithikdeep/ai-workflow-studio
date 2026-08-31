import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { ExecutionsModule } from '../executions/executions.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [PrismaModule, ExecutionsModule, WorkflowsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
