import { IsEmail, IsIn, IsString } from 'class-validator';

const INVITABLE_ROLES = ['admin', 'member', 'viewer'];

export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsIn(INVITABLE_ROLES)
  role!: string;
}

export class AcceptInvitationDto {
  @IsString()
  token!: string;
}
