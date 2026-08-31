import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

// Returns the workspace id for the current request.
// This decorator expects an authentication layer to attach a `user` object
// to the request with a `workspaceId` property. If no authenticated
// workspace is found, the request is treated as unauthenticated and an
// `UnauthorizedException` is thrown. Do NOT fall back to a default
// workspace in production paths.
export const Workspace = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();

  // Prefer workspace id from authenticated user object: `request.user.workspaceId`
  if (req && req.user && typeof req.user.workspaceId === 'string') {
    return req.user.workspaceId;
  }

  // No authenticated workspace on the request: fail fast and surface
  // an HTTP 401 so callers know authentication/authorization is required.
  throw new UnauthorizedException('Request is not authenticated with a workspace');
});
