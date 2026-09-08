import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_COOKIES, CLEARED_COOKIE_OPTIONS } from '@/lib/oauth'

/**
 * Sign-out: clears every auth cookie and returns the operator to /login.
 *
 * POST-only: a GET logout would let any page log the operator out with a
 * mere <img src> (logout CSRF). The UI logs out via a form POST.
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.nextUrl.origin))

  response.cookies.set(AUTH_COOKIES.idToken, '', CLEARED_COOKIE_OPTIONS)
  response.cookies.set(AUTH_COOKIES.accessToken, '', CLEARED_COOKIE_OPTIONS)
  response.cookies.set(AUTH_COOKIES.refreshToken, '', CLEARED_COOKIE_OPTIONS)

  return response
}
