import { IsObject } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  /**
   * Opaque preferences blob matching the settings UI shape (per-category
   * email/in-app toggles, digest frequency/time). Stored as-is.
   */
  @IsObject()
  preferences!: Record<string, unknown>;
}
