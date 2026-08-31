import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { IntegrationCredentialsService } from './integration-credentials.service';
import { IntegrationProbeService } from './integration-probe.service';
import { GmailOAuthController } from './gmail/gmail-oauth.controller';
import { GmailOAuthService } from './gmail/gmail-oauth.service';
import { GmailClient } from './gmail/gmail-client';

@Module({
  imports: [PrismaModule],
  controllers: [IntegrationsController, GmailOAuthController],
  providers: [
    IntegrationsService,
    IntegrationCredentialsService,
    IntegrationProbeService,
    GmailOAuthService,
    GmailClient,
  ],
  exports: [
    IntegrationsService,
    IntegrationCredentialsService,
    GmailOAuthService,
    GmailClient,
  ],
})
export class IntegrationsModule {}
