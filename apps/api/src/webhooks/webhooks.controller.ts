import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';

import { WebhooksService } from './webhooks.service';
import { Workspace } from '../common/decorators/workspace.decorator';

@Controller()
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  // ------------------------------------------------------------------------
  // PUBLIC — external systems call this. No browser session required;
  // authenticated by the per-workflow webhook secret.
  // ------------------------------------------------------------------------
  @Post('webhooks/:workflowId')
  async trigger(
    @Param('workflowId') workflowId: string,
    @Req() req: Request,
    @Body() body: unknown,
    @Headers('x-webhook-secret') headerSecret?: string,
    @Headers('authorization') authorization?: string,
    @Headers('content-type') contentType?: string,
    @Headers('x-webhook-event-id') eventId?: string,
  ) {
    if (
      contentType &&
      !contentType.toLowerCase().includes('application/json')
    ) {
      throw new UnsupportedMediaTypeException(
        'Webhook body must be application/json',
      );
    }

    // Express' json parser leaves `body` undefined on a non-JSON / empty body
    // and throws (handled globally) on malformed JSON.
    if (body !== undefined && (typeof body !== 'object' || Array.isArray(body))) {
      throw new BadRequestException('Webhook body must be a JSON object');
    }

    const bearer =
      typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length).trim()
        : undefined;

    return this.service.trigger({
      workflowId,
      providedSecret: headerSecret ?? bearer,
      body: body ?? {},
      query: (req.query as Record<string, unknown>) ?? {},
      eventId: eventId?.trim() || undefined,
    });
  }

  // ------------------------------------------------------------------------
  // AUTHENTICATED CONFIG — workspace-scoped
  // ------------------------------------------------------------------------
  @Get('webhooks/:workflowId')
  getConfig(
    @Workspace() workspaceId: string,
    @Param('workflowId') workflowId: string,
  ) {
    return this.service.getConfig(workspaceId, workflowId);
  }

  @Post('webhooks/:workflowId/rotate')
  rotate(
    @Workspace() workspaceId: string,
    @Param('workflowId') workflowId: string,
  ) {
    return this.service.rotateSecret(workspaceId, workflowId);
  }

  @Patch('webhooks/:workflowId')
  setEnabled(
    @Workspace() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Body() body: { enabled?: unknown },
  ) {
    if (typeof body?.enabled !== 'boolean') {
      throw new BadRequestException('`enabled` (boolean) is required');
    }
    return this.service.setEnabled(workspaceId, workflowId, body.enabled);
  }
}
