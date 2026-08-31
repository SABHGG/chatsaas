import { NextResponse, type NextRequest } from 'next/server'
import {
  AUTH_COOKIES,
  FLOW_COOKIE_OPTIONS,
  buildAuthorizeUrl,
  createCodeChallenge,
  createCodeVerifier,
  createState,
  sanitizeNextPath,
} from '@/lib/oauth'

/**
 * Sign-in entry point: mints state + PKCE (S256), stores them in
 * short-lived HTTP-only cookies, and redirects to the Cognito authorize
 * endpoint. The callback (api/auth/callback) verifies state and verifier
 * before any token is accepted.
 */
export async function GET(request: NextRequest) {
  const state = createState()
  const codeVerifier = createCodeVerifier()
  const codeChallenge = await createCodeChallenge(codeVerifier)
  const next = sanitizeNextPath(request.nextUrl.searchParams.get('next'))

  const response = NextResponse.redirect(
    buildAuthorizeUrl({ origin: request.nextUrl.origin, state, codeChallenge }).toString(),
  )

  response.cookies.set(AUTH_COOKIES.oauthState, state, FLOW_COOKIE_OPTIONS[AUTH_COOKIES.oauthState])
  response.cookies.set(AUTH_COOKIES.pkceVerifier, codeVerifier, FLOW_COOKIE_OPTIONS[AUTH_COOKIES.pkceVerifier])
  response.cookies.set(AUTH_COOKIES.authNext, next, FLOW_COOKIE_OPTIONS[AUTH_COOKIES.authNext])

  return response
}
