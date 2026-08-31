import { NextResponse } from 'next/server'

/**
 * No server-side auth gate.
 *
 * The session cookie (`AWF_AT`) is issued by the API on its own origin, so it
 * is not readable here on the web origin — a presence check would always fail
 * and bounce authenticated users back to `/login`. Authentication for the app
 * routes (`/dashboard`, `/workflows`, `/executions`, `/integrations`,
 * `/variables`, `/templates`, `/settings`, `/profile`, …) is handled entirely
 * client-side by `AuthGuard`, which verifies the session with a credentialed
 * `GET /auth/me` against the API. `/` (marketing) and `/login` are public and
 * need no handling here either.
 *
 * This proxy is kept as an intentional pass-through so a real server-side
 * concern (e.g. a first-party session once the app and API share a domain)
 * has an obvious home without adding a new file.
 */
export function proxy() {
  return NextResponse.next()
}

export const config = {
  // Skip Next internals and static assets even though this is a no-op.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
}
