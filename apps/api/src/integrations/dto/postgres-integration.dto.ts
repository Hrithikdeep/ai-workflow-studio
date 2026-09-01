import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { BaseIntegrationConfigDto } from './base-integration-config.dto';

/**
 * Config accepted for a `postgresql` integration.
 *
 * Non-secret: `host`, `port`, `database`, `username`, `ssl`.
 * Secret (extracted + encrypted): `credential` (legacy) / `password`, or a
 * full `connectionString` (which embeds the password).
 */
export class PostgresIntegrationConfigDto extends BaseIntegrationConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  database?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  username?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(require|prefer|disable|no-verify)$/, {
    message: 'ssl must be one of: require, prefer, disable, no-verify',
  })
  ssl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  credential?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  connectionString?: string;
}
