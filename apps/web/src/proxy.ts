import { NextResponse, type NextRequest } from 'next/server'

/**
 * Gate for the authenticated app.
 *
 * This only checks for the *presence* of the `AWF_AT` session cookie so an
 * unauthenticated browser is sent to `/login` instead of hitting API calls
 * that 401. The API remains the real authority: it still verifies the JWT
 * and resolves the workspace on every request. A present-but-invalid
 * cookie is handled client-side by `AuthGuard` (via `GET /auth/me`).
 */

const AUTH_COOKIE = 'AWF_AT'
// `/` is the public marketing landing page; `/login` is the auth screen.
// Everything else stays gated behind the session cookie.
const PUBLIC_PATHS = ['/', '/login']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
  const hasSession = request.cookies.has(AUTH_COOKIE)

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    if (pathname && pathname !== '/') {
      url.searchParams.set('next', pathname)
    }
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
}
