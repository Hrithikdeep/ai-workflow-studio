import { Controller, Get, Param, Post } from '@nestjs/common';

import { Workspace } from '../common/decorators/workspace.decorator';
import { TemplatesService } from './templates.service';

/**
 * All routes are workspace-scoped via `@Workspace()` (resolved from the
 * authenticated session by the middleware in `main.ts`). A workspaceId is
 * never taken from the client. `:id` routes look the template up by
 * `{ id, workspaceId }`, so another workspace's template is a 404.
 */
@Controller('templates')
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Get()
  list(@Workspace() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get(':id')
  get(@Workspace() workspaceId: string, @Param('id') id: string) {
    return this.service.get(workspaceId, id);
  }

  @Post(':id/use')
  use(@Workspace() workspaceId: string, @Param('id') id: string) {
    return this.service.use(workspaceId, id);
  }
}
