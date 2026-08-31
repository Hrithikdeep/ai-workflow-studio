import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ExecutionsModule } from './executions/executions.module';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './crypto/crypto.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { VariablesModule } from './variables/variables.module';
import { AuthModule } from './auth/auth.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { InvitationsModule } from './invitations/invitations.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [
    PrismaModule,
    CryptoModule,
    AuthModule,
    WorkflowsModule,
    ExecutionsModule,
    VariablesModule,
    IntegrationsModule,
    WebhooksModule,
    WorkspaceModule,
    InvitationsModule,
    ApiKeysModule,
    NotificationsModule,
    TemplatesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}