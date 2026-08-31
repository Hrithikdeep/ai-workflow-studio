import { NextResponse, type NextRequest } from 'next/server'

/**
 * Same-origin API proxy.
 *
 * The browser calls this route on the web origin (`/api/...`). It forwards the
 * request server-to-server to the real API and relays the response, including
 * `Set-Cookie`. The auth cookie (`AWF_AT`) therefore lands as a **first-party**
 * cookie on the web origin — production browsers keep it with no third-party
 * cookie dependency. The API stays the sole auth authority: it still verifies
 * the JWT and resolves the workspace on every request.
 *
 * Nothing here exposes a token to client JavaScript: the proxy runs only on
 * the server, `AWF_AT` stays `HttpOnly`, and the login/signup JSON bodies
 * returned by the API contain user fields only (never the token).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Server-only target for the real API. Falls back to the existing public var. */
function apiTarget(): string {
  const raw =
    process.env.API_PROXY_TARGET?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    'http://localhost:3001'
  return raw.replace(/\/+$/, '')
}

// Browser -> API. Deliberately excludes host / origin / referer / content-length
// / accept-encoding / connection so `fetch` manages the upstream connection.
const REQUEST_HEADER_ALLOWLIST = [
  'content-type',
  'accept',
  'cookie',
  'x-api-key',
]

// API -> browser. `set-cookie` is handled separately below.
const RESPONSE_HEADER_ALLOWLIST = [
  'content-type',
  'cache-control',
  'location',
]

/**
 * The cookie now belongs to the web origin. Drop any `Domain` (it would point
 * at the API host and be rejected) and downgrade `SameSite=None` to `Lax`
 * since cross-site delivery is no longer needed. `Secure` and `HttpOnly` are
 * preserved as-is.
 */
function rewriteSetCookie(value: string): string {
  return value
    .replace(/;\s*Domain=[^;]*/i, '')
    .replace(/;\s*SameSite=None/i, '; SameSite=Lax')
}

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<NextResponse> {
  const { path } = await ctx.params
  const upstreamPath = (path ?? []).map(encodeURIComponent).join('/')
  const target = `${apiTarget()}/${upstreamPath}${req.nextUrl.search}`

  const requestHeaders = new Headers()
  for (const name of REQUEST_HEADER_ALLOWLIST) {
    const value = req.headers.get(name)
    if (value) requestHeaders.set(name, value)
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const bodyBuffer = hasBody ? await req.arrayBuffer() : undefined

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: requestHeaders,
      body:
        bodyBuffer && bodyBuffer.byteLength > 0 ? bodyBuffer : undefined,
      redirect: 'manual',
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json(
      { message: 'The API could not be reached.', code: 'PROXY_UPSTREAM_ERROR' },
      { status: 502 },
    )
  }

  const responseHeaders = new Headers()
  for (const name of RESPONSE_HEADER_ALLOWLIST) {
    const value = upstream.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', rewriteSetCookie(cookie))
  }

  const noBody = upstream.status === 204 || upstream.status === 304
  const responseBody = noBody ? null : await upstream.arrayBuffer()

  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as OPTIONS,
  proxy as HEAD,
}
