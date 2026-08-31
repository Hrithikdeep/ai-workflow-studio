import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

import { BaseIntegrationConfigDto } from './base-integration-config.dto';

/**
 * Config accepted for a `gmail` integration.
 *
 * Non-secret: `account`, `senderName`.
 * Secret (extracted + encrypted): `credential` (legacy), `refreshToken`,
 * `appPassword`.
 *
 * NOTE: the real Gmail OAuth flow and executor land in a later step. This
 * DTO only lets the metadata + any pre-obtained secret be stored safely.
 */
export class GmailIntegrationConfigDto extends BaseIntegrationConfigDto {
  @IsOptional()
  @IsEmail({}, { message: 'account must be a valid email address' })
  @MaxLength(320)
  account?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  senderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  credential?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  refreshToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  appPassword?: string;
}
