import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { BaseIntegrationConfigDto } from './base-integration-config.dto';

/**
 * Config accepted for an `http` integration.
 *
 * Non-secret: `baseUrl`, `authType`.
 * Secret (extracted + encrypted, never stored in `Integration.config`):
 * `credential` (legacy generic), `apiKey`, `bearerToken`,
 * `basicAuthPassword`, `clientSecret`.
 */
export class HttpIntegrationConfigDto extends BaseIntegrationConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^https?:\/\/.+/i, {
    message: 'baseUrl must be an absolute http(s) URL',
  })
  baseUrl?: string;

  @IsOptional()
  @IsIn(['None', 'Basic', 'Bearer Token', 'API Key'])
  authType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  credential?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  bearerToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  basicAuthPassword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  clientSecret?: string;
}
