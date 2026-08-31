import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Non-secret display metadata that the web form sends alongside every
 * provider's config. Provider config DTOs extend this.
 */
export class BaseIntegrationConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
