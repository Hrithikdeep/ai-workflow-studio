import { IsOptional, IsString, MaxLength } from 'class-validator';

import { BaseIntegrationConfigDto } from './base-integration-config.dto';

/**
 * Config accepted for a `slack` integration.
 *
 * Non-secret: `workspace`, `channel`.
 * Secret (extracted + encrypted): `credential` (legacy) / `botToken`
 * (Slack bot token, `xoxb-...`).
 */
export class SlackIntegrationConfigDto extends BaseIntegrationConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  workspace?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  channel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  credential?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  botToken?: string;
}
