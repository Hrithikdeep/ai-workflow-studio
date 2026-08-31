import {
  Controller,
  Get,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { GmailOAuthService } from './gmail-oauth.service';
import { Workspace } from '../../common/decorators/workspace.decorator';

/**
 * Server-side Google OAuth 2.0 for Gmail.
 *
 * - `GET start`    authenticated; workspace + user come from the session,
 *                  never from the request. Redirects to Google's consent page.
 * - `GET callback` hit by Google's redirect. Authenticated purely by the
 *                  single-use `state` token (bound to workspace + user).
 *
 * No token, code, or client secret is ever returned to the browser.
 */
@Controller('integrations/gmail/oauth')
export class GmailOAuthController {
  constructor(private readonly oauth: GmailOAuthService) {}

  @Get('start')
  async start(
    @Workspace() workspaceId: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('integrationId') integrationId?: string,
    @Query('redirectTo') redirectTo?: string,
  ) {
    const userId =
      (req as Request & { user?: { id?: string } }).user?.id ?? 'unknown';

    const url = await this.oauth.createAuthorizationUrl({
      workspaceId,
      userId,
      integrationId:
        typeof integrationId === 'string' && integrationId.trim()
          ? integrationId.trim()
          : undefined,
      redirectTo: typeof redirectTo === 'string' ? redirectTo : undefined,
    });

    res.redirect(url);
  }

  @Get('callback')
  async callback(
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    const { redirectTo } = await this.oauth.handleCallback({
      code,
      state,
      error,
    });
    res.redirect(redirectTo);
  }
}
