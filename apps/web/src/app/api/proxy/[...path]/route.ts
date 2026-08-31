import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_COOKIES } from '@/lib/oauth'

/**
 * Catch-all BFF proxy: forwards same-origin requests from
 * `/api/proxy/<path>` to the backend API (base URL from
 * NEXT_PUBLIC_API_URL, which already ends in `/api`).
 *
 * Why this exists: the `access_token` cookie is httpOnly (lib/oauth.ts),
 * so client components cannot attach `Authorization: Bearer`. The proxy
 * attaches it server-side from the cookie and the browser never sees the
 * token. Server Components skip this route and call `apiRequest` directly.
 *
 * Contract (binding, orchestrator decision):
 * - The upstream response status and body pass through UNMAPPED — an
 *   upstream 429 reaches the client as 429 so `lib/api-errors.ts` renders
 *   the line-vocabulary "On hold".
 * - Request bodies are STREAMED (`request.body` + `duplex: 'half'`),
 *   never buffered — multipart uploads of 10 MB files must not be held
 *   in memory.
 * - `X-Requested-With: XMLHttpRequest` is required on mutations before
 *   anything is forwarded (R-7 CSRF). The proxy enforces it fail-closed:
 *   a mutation without the header is rejected with 403 and never reaches
 *   the backend. Cookies and a client-supplied Authorization header are
 *   stripped; the only credential forwarded is our own Bearer token.
 *
 * Edge compatibility: only `next/server` + Web APIs; no Node SDKs.
 */

/** Hop-by-hop and identity headers never forwarded upstream. */
const REQUEST_BLOCKLIST = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'upgrade',
  'cookie',
  'authorization',
])

/**
 * Response headers never copied back: hop-by-hop plus re-compression and
 * length headers (undici already decoded the body stream, so the
 * upstream `content-encoding`/`content-length` no longer match what is
 * forwarded). Cookies are set by this app only — never relayed from the
 * backend.
 */
const RESPONSE_BLOCKLIST = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
  'content-length',
  'set-cookie',
])

function apiBaseUrl(): string {
  // Mirrors lib/api-client.ts (same env var, same default).
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api').replace(/\/+$/, '')
}

export interface ProxyContext {
  params: Promise<{ path: string[] }>
}

async function handleProxy(request: NextRequest, context: ProxyContext): Promise<Response> {
  const method = request.method.toUpperCase()
  const isMutation = method !== 'GET' && method !== 'HEAD'

  // CSRF gate (R-7): mutations must prove same-origin intent before the
  // proxy forwards anything.
  if (isMutation && request.headers.get('x-requested-with') !== 'XMLHttpRequest') {
    return NextResponse.json({ error: 'AUTHORIZATION_ERROR' }, { status: 403 })
  }

  const { path } = await context.params
  const segments = path
  if (segments.length === 0 || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    // Never let a crafted path pop out of the API prefix (SSRF hardening).
    return NextResponse.json({ error: 'NOT_FOUND_ERROR' }, { status: 404 })
  }

  const headers = new Headers()
  request.headers.forEach((value, key) => {
    if (!REQUEST_BLOCKLIST.has(key)) headers.set(key, value)
  })

  const accessToken = request.cookies.get(AUTH_COOKIES.accessToken)?.value
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const url = `${apiBaseUrl()}/${segments.join('/')}${request.nextUrl.search}`

  let upstream: Response
  try {
    // Stream the raw request body straight through — multipart uploads
    // must not be buffered. `duplex: 'half'` is required by undici when
    // the body is a stream; the DOM RequestInit type does not declare it.
    upstream = await fetch(url, {
      method,
      headers,
      body: request.body,
      // undici requires this when the body is a stream; absent from DOM types.
      duplex: 'half',
    } as RequestInit)
  } catch {
    // The backend did not answer — operator copy comes from the client's
    // api-errors mapping of 502.
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 502 })
  }

  const responseHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    if (!RESPONSE_BLOCKLIST.has(key)) responseHeaders.set(key, value)
  })

  // Status and body pass through unmapped (429 stays 429 → "On hold").
  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

export async function GET(request: NextRequest, context: ProxyContext): Promise<Response> {
  return handleProxy(request, context)
}

export async function POST(request: NextRequest, context: ProxyContext): Promise<Response> {
  return handleProxy(request, context)
}

export async function PATCH(request: NextRequest, context: ProxyContext): Promise<Response> {
  return handleProxy(request, context)
}

export async function PUT(request: NextRequest, context: ProxyContext): Promise<Response> {
  return handleProxy(request, context)
}

export async function DELETE(request: NextRequest, context: ProxyContext): Promise<Response> {
  return handleProxy(request, context)
}
