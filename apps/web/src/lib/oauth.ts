/**
 * Cognito OAuth2 (authorization code + PKCE) helpers for the Operator's
 * Board sign-in flow (ADR-001, WI-008 stack outputs).
 *
 * SECURITY NOTES
 * - The authorization-code exchange is a plain HTTPS call to the Cognito
 *   OAuth2 token endpoint. The AWS SDK client
 *   (`@aws-sdk/client-cognito-identity-provider`) exposes no command for
 *   this exchange — the OAuth2 grant endpoints live outside the IDP API —
 *   so `fetch` is used directly.
 * - PKCE (S256) is always used, even for confidential clients.
 * - `next` targets are sanitized to same-origin relative paths, so a
 *   crafted `?next=` can never bounce the operator off-site.
 */

export const AUTH_COOKIES = {
  idToken: 'id_token',
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
  // Sign-in flow state (short-lived, cleared after the callback):
  oauthState: 'oauth_state',
  pkceVerifier: 'pkce_verifier',
  authNext: 'auth_next',
} as const

/** Cookie attributes shared by every cookie this app sets. */
const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}

const ACCESS_TOKEN_MAX_AGE_S = 60 * 60 // 1 hour (Cognito default)
const REFRESH_TOKEN_MAX_AGE_S = 60 * 60 * 24 * 30 // 30 days

/**
 * The full cookie set for a signed-in operator. The names are binding
 * (WI-007 Task 5): `id_token`, `access_token`, `refresh_token`.
 */
export const TOKEN_COOKIE_OPTIONS = {
  [AUTH_COOKIES.idToken]: { ...BASE_COOKIE_OPTIONS, maxAge: ACCESS_TOKEN_MAX_AGE_S },
  [AUTH_COOKIES.accessToken]: { ...BASE_COOKIE_OPTIONS, maxAge: ACCESS_TOKEN_MAX_AGE_S },
  [AUTH_COOKIES.refreshToken]: { ...BASE_COOKIE_OPTIONS, maxAge: REFRESH_TOKEN_MAX_AGE_S },
} as const

/** Short-lived cookies that carry the sign-in flow itself. */
export const FLOW_COOKIE_OPTIONS = {
  [AUTH_COOKIES.oauthState]: { ...BASE_COOKIE_OPTIONS, maxAge: 600 },
  [AUTH_COOKIES.pkceVerifier]: { ...BASE_COOKIE_OPTIONS, maxAge: 600 },
  [AUTH_COOKIES.authNext]: { ...BASE_COOKIE_OPTIONS, maxAge: 600 },
} as const

/** Clearing never needs an age — just an expired echo of the name. */
export const CLEARED_COOKIE_OPTIONS = { ...BASE_COOKIE_OPTIONS, maxAge: 0 } as const

/**
 * The Cognito App Client domain host that serves the OAuth2 endpoints.
 * Accepts a bare host or a full URL; normalizes to a host.
 */
export function getCognitoDomain(): string {
  const raw = process.env.NEXT_PUBLIC_COGNITO_DOMAIN
  if (!raw || raw.trim().length === 0) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_COGNITO_DOMAIN')
  }
  const trimmed = raw.trim()
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).host
  } catch {
    throw new Error('NEXT_PUBLIC_COGNITO_DOMAIN is not a valid host')
  }
}

export function getCognitoClientId(): string {
  const value = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
  if (!value || value.trim().length === 0) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_COGNITO_CLIENT_ID')
  }
  return value.trim()
}

/**
 * Restrict post-sign-in redirects to same-origin relative paths. Rejects
 * absolute URLs, protocol-relative `//host`, backslashes, and control
 * characters. Empty/null input returns the default landing path.
 */
export function sanitizeNextPath(raw: string | null | undefined, fallback = '/board'): string {
  if (!raw) return fallback
  if (!raw.startsWith('/')) return fallback
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback
  return raw
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomBase64url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64urlEncode(bytes)
}

/** A fresh state nonce (≥128 bits of entropy). */
export function createState(): string {
  return randomBase64url(16)
}

/** A fresh PKCE code verifier (RFC 7636: 43–128 chars, URL-safe). */
export function createCodeVerifier(): string {
  return randomBase64url(48)
}

/** S256 code challenge for a verifier. */
export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64urlEncode(new Uint8Array(digest))
}

export interface AuthorizeUrlInput {
  /** The app origin the callback must return to (request origin). */
  origin: string
  state: string
  codeChallenge: string
}

/** Build the Cognito authorize URL (authorization code grant + PKCE). */
export function buildAuthorizeUrl({ origin, state, codeChallenge }: AuthorizeUrlInput): URL {
  const authorizeUrl = new URL(`https://${getCognitoDomain()}/oauth2/authorize`)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', getCognitoClientId())
  authorizeUrl.searchParams.set('redirect_uri', new URL('/api/auth/callback', origin).toString())
  authorizeUrl.searchParams.set('scope', 'openid email profile')
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  return authorizeUrl
}

export interface TokenSet {
  id_token: string
  access_token: string
  refresh_token?: string
  expires_in: number
}

/**
 * Exchange an authorization code for tokens at the Cognito OAuth2 token
 * endpoint. When COGNITO_CLIENT_SECRET is set (confidential client) the
 * request authenticates with HTTP Basic per RFC 6749 §2.3.1.
 */
export async function exchangeCodeForTokens(input: {
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: getCognitoClientId(),
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  const clientSecret = process.env.COGNITO_CLIENT_SECRET
  if (clientSecret) {
    const basic = btoa(`${getCognitoClientId()}:${clientSecret}`)
    headers.Authorization = `Basic ${basic}`
  }

  const response = await fetch(`https://${getCognitoDomain()}/oauth2/token`, {
    method: 'POST',
    headers,
    body: body.toString(),
  })

  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    const err = new Error('Token exchange failed') as Error & { status?: number; detail?: unknown }
    err.status = response.status
    err.detail = detail
    throw err
  }

  const tokenSet = (await response.json()) as TokenSet
  if (!tokenSet.id_token || !tokenSet.access_token) {
    throw new Error('Token exchange returned an incomplete token set')
  }
  return tokenSet
}
