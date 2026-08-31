import { IsOptional, IsString, MaxLength } from 'class-validator';

import { BaseIntegrationConfigDto } from './base-integration-config.dto';

/**
 * Config accepted for an `openai` integration.
 *
 * Non-secret: nothing beyond the shared display metadata.
 * Secret (extracted + encrypted, never stored in `Integration.config`):
 * `apiKey` — an OpenAI API key (`sk-...`). It is routed through the existing
 * `splitProviderConfig()` / `IntegrationCredentialsService` path and never
 * kept on the `Integration` row.
 */
export class OpenAiIntegrationConfigDto extends BaseIntegrationConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  apiKey?: string;
}
