import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string | null;
  workspaceId?: string;
}

/**
 * Returns the authenticated user attached to the request by the auth
 * middleware in `main.ts`. Throws 401 when the request is unauthenticated.
 * Mirrors the contract of {@link Workspace} but for the user identity.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest();
    if (req && req.user && typeof req.user.id === 'string') {
      return req.user as AuthenticatedUser;
    }
    throw new UnauthorizedException('Request is not authenticated');
  },
);
