import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Res,
  Get,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto, LoginDto } from './dto/auth.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import type { CookieOptions, Response, Request } from 'express';

const AUTH_COOKIE_NAME = 'AWF_AT';

function getAuthCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    sameSite: isProduction ? ('none' as const) : ('lax' as const),
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 30,
  };
}

function getRequestCookies(req: Request): Record<string, unknown> {
  const requestWithCookies = req as unknown as { cookies?: unknown };
  const cookies: unknown = requestWithCookies.cookies;

  if (cookies && typeof cookies === 'object' && !Array.isArray(cookies)) {
    return cookies as Record<string, unknown>;
  }

  return {};
}

function getAuthToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;

  if (
    authHeader &&
    typeof authHeader === 'string' &&
    authHeader.startsWith('Bearer ')
  ) {
    return authHeader.slice(7).trim();
  }

  const token = getRequestCookies(req)[AUTH_COOKIE_NAME];

  return typeof token === 'string' ? token : undefined;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('signup')
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token, workspaceId } = await this.auth.signup(
      dto.email,
      dto.password,
      dto.name,
    );
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
    return { id: user.id, email: user.email, name: user.name, workspaceId };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.login(dto.email, dto.password);
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
    return { id: user.id, email: user.email, name: user.name };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = getAuthToken(req);
    if (token) await this.auth.logout(token);
    res.clearCookie(AUTH_COOKIE_NAME, getAuthCookieOptions());
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: Request) {
    // The auth middleware in main.ts attaches `req.user` when authenticated
    const user = (req as Request & { user?: unknown }).user;
    return { user: user ?? null };
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() current: AuthenticatedUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateProfileDto,
  ) {
    const user = await this.auth.updateProfile(current.id, {
      name: dto.name,
      email: dto.email,
    });
    return {
      user: { ...user, workspaceId: current.workspaceId ?? null },
    };
  }

  @Get('sessions')
  sessions(@Req() req: Request, @CurrentUser() current: AuthenticatedUser) {
    return this.auth.listSessions(current.id, getAuthToken(req));
  }

  @Delete('sessions/others')
  revokeOtherSessions(
    @Req() req: Request,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.auth.revokeOtherSessions(current.id, getAuthToken(req));
  }

  @Delete('sessions/all')
  async revokeAllSessions(
    @CurrentUser() current: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.revokeAllSessions(current.id);
    res.clearCookie(AUTH_COOKIE_NAME, getAuthCookieOptions());
    return result;
  }

  @Delete('sessions/:id')
  revokeSession(
    @CurrentUser() current: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.auth.revokeSession(current.id, id);
  }
}
