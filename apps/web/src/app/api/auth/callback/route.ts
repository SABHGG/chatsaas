import { NextResponse, type NextRequest } from 'next/server'
import {
  AUTH_COOKIES,
  CLEARED_COOKIE_OPTIONS,
  FLOW_COOKIE_OPTIONS,
  TOKEN_COOKIE_OPTIONS,
  exchangeCodeForTokens,
  sanitizeNextPath,
} from '@/lib/oauth'

/**
 * OAuth2 callback: verifies `state`, exchanges the authorization code for
 * tokens (code + PKCE S256), sets the HTTP-only session cookies
 * (`id_token`, `access_token`, `refresh_token`), and returns the operator
 * to the page they originally requested (from the `auth_next` cookie).
 *
 * Every failure path lands on /login with an `error=` hint — the operator
 * never sees a stack trace, and no token is ever set on a failed exchange.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const oauthState = request.nextUrl.searchParams.get('state')
  const code = request.nextUrl.searchParams.get('code')
  const oauthError = request.nextUrl.searchParams.get('error')

  // Cognito redirected back with an error (operator cancelled, etc.).
  if (oauthError) {
    return redirectToLogin('sign_in_cancelled', origin)
  }

  // State mismatch: the response does not belong to a flow this browser
  // started (CSRF on the authorization endpoint). Fail closed.
  const expectedState = request.cookies.get(AUTH_COOKIES.oauthState)?.value
  if (!oauthState || !expectedState || oauthState !== expectedState) {
    return redirectToLogin('state_mismatch', origin)
  }

  const codeVerifier = request.cookies.get(AUTH_COOKIES.pkceVerifier)?.value
  if (!code || !codeVerifier) {
    return redirectToLogin('missing_code', origin)
  }

  let tokenSet
  try {
    tokenSet = await exchangeCodeForTokens({
      code,
      codeVerifier,
      redirectUri: new URL('/api/auth/callback', origin).toString(),
    })
  } catch {
    // Invalid/expired/consumed code, PKCE mismatch, or the token
    // endpoint refused the exchange — same sanitized outcome for all.
    return redirectToLogin('invalid_code', origin)
  }

  // Next serializes cookie values with encodeURIComponent but does not
  // decode them on read — undo that once before sanitizing.
  const rawNext = request.cookies.get(AUTH_COOKIES.authNext)?.value
  const decodedNext = safeDecode(rawNext)
  const next = sanitizeNextPath(decodedNext)

  const response = NextResponse.redirect(new URL(next, origin))
  response.cookies.set(AUTH_COOKIES.idToken, tokenSet.id_token, TOKEN_COOKIE_OPTIONS[AUTH_COOKIES.idToken])
  response.cookies.set(AUTH_COOKIES.accessToken, tokenSet.access_token, TOKEN_COOKIE_OPTIONS[AUTH_COOKIES.accessToken])
  if (tokenSet.refresh_token) {
    response.cookies.set(AUTH_COOKIES.refreshToken, tokenSet.refresh_token, TOKEN_COOKIE_OPTIONS[AUTH_COOKIES.refreshToken])
  }

  // The flow cookies have done their job.
  response.cookies.set(AUTH_COOKIES.oauthState, '', CLEARED_COOKIE_OPTIONS)
  response.cookies.set(AUTH_COOKIES.pkceVerifier, '', CLEARED_COOKIE_OPTIONS)
  response.cookies.set(AUTH_COOKIES.authNext, '', CLEARED_COOKIE_OPTIONS)

  return response
}

function redirectToLogin(errorCode: string, origin: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/login?error=${errorCode}`, origin))
  // Never keep flow state alive after a failed attempt.
  response.cookies.set(AUTH_COOKIES.oauthState, '', FLOW_COOKIE_OPTIONS[AUTH_COOKIES.oauthState])
  response.cookies.set(AUTH_COOKIES.pkceVerifier, '', FLOW_COOKIE_OPTIONS[AUTH_COOKIES.pkceVerifier])
  response.cookies.set(AUTH_COOKIES.authNext, '', FLOW_COOKIE_OPTIONS[AUTH_COOKIES.authNext])
  return response
}

function safeDecode(value: string | undefined): string | undefined {
  if (!value) return value
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
