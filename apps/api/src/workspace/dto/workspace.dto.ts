import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { WORKSPACE_ROLES } from '../workspace-access.service';

const ENVIRONMENTS = ['Production', 'Staging', 'Development'];
const VISIBILITIES = ['Workspace', 'Private'];

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(ENVIRONMENTS)
  defaultEnvironment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  defaultTimezone?: string;

  @IsOptional()
  @IsString()
  @IsIn(VISIBILITIES)
  defaultVisibility?: string;
}

export class UpdateMemberRoleDto {
  @IsString()
  @IsIn(WORKSPACE_ROLES as unknown as string[])
  role!: string;
}
