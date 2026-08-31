import { IsOptional, IsString, MaxLength } from 'class-validator';

import { BaseIntegrationConfigDto } from './base-integration-config.dto';

/**
 * Config accepted for a `webhook` integration.
 *
 * Non-secret: `endpointName`.
 * Secret (extracted + encrypted): `signingSecret` (used later to verify
 * inbound webhook signatures), `credential`.
 */
export class WebhookIntegrationConfigDto extends BaseIntegrationConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  endpointName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  signingSecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  credential?: string;
}
