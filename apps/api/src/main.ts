import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { createHash } from 'node:crypto';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for the web app. In production set CORS_ORIGIN to the deployed
  // frontend origin (e.g. the Vercel URL); locally it falls back to
  // http://localhost:3000. Credentials stay enabled for the auth cookie, so a
  // wildcard origin is never used.
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Auth middleware: verifies a signed JWT (in cookie `AWF_AT` or
  // Authorization Bearer header). If valid, loads the user and the
  // user's default workspace membership and attaches `req.user`.
  // Unauthenticated requests continue without `req.user` (decorators
  // like `@Workspace()` will throw 401 when required).
  const prisma = new PrismaClient();
  app.use(cookieParser());
  app.use(async (req: any, _res: any, next: any) => {
    try {
      // API-key path: `X-API-Key` authenticates as the key's creator, scoped
      // to the key's workspace. Same `req.user` shape — not a second auth
      // system. Only the sha256 hash is compared; the raw key is never stored.
      const rawApiKey = req.headers && (req.headers['x-api-key'] || req.headers['X-API-Key']);
      if (rawApiKey && typeof rawApiKey === 'string' && rawApiKey.trim()) {
        const hashedKey = createHash('sha256').update(rawApiKey.trim(), 'utf8').digest('hex');
        const apiKey = await prisma.apiKey.findUnique({ where: { hashedKey } });
        if (apiKey && !apiKey.revokedAt) {
          const keyUser = await prisma.user.findUnique({ where: { id: apiKey.createdById } });
          if (keyUser) {
            req.user = {
              id: keyUser.id,
              email: keyUser.email,
              name: keyUser.name,
              workspaceId: apiKey.workspaceId,
            };
            prisma.apiKey
              .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
              .catch(() => undefined);
          }
        }
        return next();
      }

      const authHeader = req.headers && (req.headers.authorization || req.headers.Authorization);
      let token: string | undefined;

      if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice('Bearer '.length).trim();
      } else if (req.headers && req.headers.cookie) {
        const match = req.headers.cookie.split(';').map((s: string) => s.trim()).find((c: string) => c.startsWith('AWF_AT='));
        if (match) token = decodeURIComponent(match.split('=')[1] || '');
      }

      if (!token) return next();

      const secret = process.env.JWT_SECRET;

      // Primary path: verify JWT when a secret is configured.
      if (secret) {
        const payload: any = jwt.verify(token, secret);
        if (!payload || !payload.sub) return next();

        // The token must still correspond to a live session row. Logout and
        // "revoke sessions" delete that row, so a signed-but-revoked JWT no
        // longer authenticates.
        const session = await prisma.session.findUnique({ where: { token } });
        if (!session) return next();

        const user = await prisma.user.findUnique({ where: { id: payload.sub } });
        if (!user) return next();

        // find default membership or first workspace membership
        const membership = await prisma.membership.findFirst({ where: { userId: user.id, isDefault: true } })
          || await prisma.membership.findFirst({ where: { userId: user.id } });

        req.user = { id: user.id, email: user.email, name: user.name };
        if (membership) req.user.workspaceId = membership.workspaceId;
      } else {
        // Fallback: if no JWT secret is configured (local dev), resolve the
        // session token directly from the DB to establish `req.user` and
        // workspace membership. This keeps the authentication path working in
        // dev without changing the overall architecture. It does not alter
        // authorization checks; controllers still rely on `@Workspace()`.
        const session = await prisma.session.findUnique({ where: { token } });
        if (!session) return next();

        const user = await prisma.user.findUnique({ where: { id: session.userId } });
        if (!user) return next();

        const membership = await prisma.membership.findFirst({ where: { userId: user.id, isDefault: true } })
          || await prisma.membership.findFirst({ where: { userId: user.id } });

        req.user = { id: user.id, email: user.email, name: user.name };
        if (membership) req.user.workspaceId = membership.workspaceId;
      }
    } catch (err) {
      // ignore auth errors — leave request unauthenticated
    }
    return next();
  });

  // Railway injects PORT; fall back to 3001 for local development. Bind on
  // 0.0.0.0 so the platform can route to the container.
  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');

  console.log(`API running on port ${port}`);
}

bootstrap();