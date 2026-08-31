import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AiModule } from '../ai/ai.module';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';
import { SlackNodeExecutor } from './executors/slack.executor';
import { GmailNodeExecutor } from './executors/gmail.executor';
import { PostgresNodeExecutor } from './executors/postgres.executor';
import { HttpNodeExecutor } from './executors/http.executor';
import { AiNodeExecutor } from './executors/ai.executor';
import { PgPoolCache } from './executors/pg-pool-cache';

@Module({
  imports: [PrismaModule, IntegrationsModule, AiModule],
  controllers: [ExecutionsController],
  providers: [
    ExecutionsService,
    SlackNodeExecutor,
    GmailNodeExecutor,
    PostgresNodeExecutor,
    HttpNodeExecutor,
    AiNodeExecutor,
    PgPoolCache,
  ],
  exports: [ExecutionsService],
})
export class ExecutionsModule {}
