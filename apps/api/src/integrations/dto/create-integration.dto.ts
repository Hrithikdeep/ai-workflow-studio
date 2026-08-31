import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

import { SUPPORTED_PROVIDERS } from '../integration-providers';

/**
 * Body for `POST /integrations`.
 *
 * `provider` is validated here; the shape of `config` is validated per
 * provider inside `IntegrationsService` (see the `*-integration.dto.ts`
 * config DTOs). Secret fields inside `config` are extracted and encrypted
 * — they are never persisted in `Integration.config`.
 */
export class CreateIntegrationDto {
  @IsString()
  @IsIn(SUPPORTED_PROVIDERS as unknown as string[])
  provider!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
