import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for `PATCH /integrations/:id`.
 *
 * `status` is intentionally NOT accepted from clients — connection health
 * is managed by the server (`POST /integrations/:id/test`). Omitting secret
 * fields from `config` leaves the existing encrypted credential untouched.
 */
export class UpdateIntegrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
