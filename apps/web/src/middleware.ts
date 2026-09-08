import { NextResponse, type NextRequest } from 'next/server'
import { verifyAccessToken } from '@/lib/jwt'
import { AUTH_COOKIES } from '@/lib/oauth'

/**
 * The board is operators-only: every /board/* request must present a
 * valid, unexpired Cognito access token (WI-007 Task 4). Invalid, expired,
 * or missing tokens are bounced to /login with `?next=` so sign-in can
 * return the operator to where they were.
 *
 * Edge compatibility: this file imports `lib/jwt.ts` (jose + fetch) and
 * `lib/oauth.ts` (constants only). The AWS SDK must never be imported
 * here — it does not run on the edge.
 */
export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(AUTH_COOKIES.accessToken)?.value
  if (accessToken) {
    const claims = await verifyAccessToken(accessToken)
    if (claims) return NextResponse.next()
  }

  const loginUrl = new URL('/login', request.url)
  const next = request.nextUrl.pathname + request.nextUrl.search
  if (next && next !== '/') {
    loginUrl.searchParams.set('next', next)
  }
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // Both entries: `/board` itself and every nested path.
  matcher: ['/board', '/board/:path*'],
}
