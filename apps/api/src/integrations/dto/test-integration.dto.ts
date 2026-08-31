import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Body for `POST /integrations/:id/test`.
 *
 * The body is optional; `timeoutMs` lets a caller shorten/lengthen the
 * provider probe timeout within a safe range.
 */
export class TestIntegrationDto {
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(30000)
  timeoutMs?: number;
}
