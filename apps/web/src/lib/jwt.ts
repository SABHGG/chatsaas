import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'

/**
 * Edge-safe Cognito JWT verification (ADR-001 / WI-008).
 *
 * This module is the ONLY auth primitive allowed inside `src/middleware.ts`:
 * it depends on `jose` and the Fetch API alone — the AWS SDK (Cognito or
 * otherwise) must never be imported from middleware or from here.
 *
 * The issuer URL and JWKS endpoint are derived from the existing
 * `NEXT_PUBLIC_COGNITO_*` env vars (no new names):
 *
 *   issuer = https://cognito-idp.{region}.amazonaws.com/{userPoolId}
 *   jwks   = {issuer}/.well-known/jwks.json
 *
 * which is exactly the `IssuerUrl` stack output WI-008 emits.
 */

export interface CognitoAccessTokenClaims extends JWTPayload {
  /** Cognito access tokens carry `client_id`, not `aud`. */
  client_id?: string
  token_use?: 'access' | 'id'
  sub?: string
  email?: string
  'custom:company_id'?: string
}

export interface CognitoIdTokenClaims extends JWTPayload {
  aud?: string
  token_use?: 'access' | 'id'
  sub?: string
  email?: string
  'custom:company_id'?: string
}

/** The trusted tenant claim (WI-008 chain of custody). */
export const COMPANY_ID_CLAIM = 'custom:company_id'

function envOrThrow(name: string): string {
  const value = process.env[name]
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

/**
 * Build the Cognito User Pool issuer URL.
 *
 * Default derivation stays exactly as WI-008 emits it:
 *   https://cognito-idp.{region}.amazonaws.com/{userPoolId}
 *
 * NEXT_PUBLIC_COGNITO_ISSUER_URL (optional) overrides the derivation
 * wholesale — the deploy-time seam for a stack-provided IssuerUrl output
 * (WI-007 Task 4) and the only way e2e runs can point verification at a
 * local mock JWKS. When unset, behavior is byte-identical to the old
 * derivation; nothing else about verification changes.
 */
export function getCognitoIssuerUrl(): string {
  const override = process.env.NEXT_PUBLIC_COGNITO_ISSUER_URL
  if (override && override.trim().length > 0) {
    return override.trim().replace(/\/+$/, '')
  }
  const region = envOrThrow('NEXT_PUBLIC_COGNITO_REGION')
  const userPoolId = envOrThrow('NEXT_PUBLIC_COGNITO_USER_POOL_ID')
  return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
}

/** The expected app client id (audience for ID tokens, `client_id` claim for access tokens). */
export function getCognitoClientId(): string {
  return envOrThrow('NEXT_PUBLIC_COGNITO_CLIENT_ID')
}

let jwksResolver: ReturnType<typeof createRemoteJWKSet> | null = null

/** Lazily create the remote JWKS resolver; jose caches keys and rotations. */
function getJwksResolver() {
  if (!jwksResolver) {
    jwksResolver = createRemoteJWKSet(new URL(`${getCognitoIssuerUrl()}/.well-known/jwks.json`), {
      cacheMaxAge: 10 * 60 * 1000,
      cooldownDuration: 30 * 1000,
      timeoutDuration: 5_000,
    })
  }
  return jwksResolver
}

/**
 * Verify a Cognito ACCESS token (signature, issuer, `token_use`,
 * `client_id`). Cognito access tokens do not carry an `aud` claim, so the
 * client id is checked via the `client_id` claim — mirroring the API-side
 * verifier in apps/functions (WI-003).
 */
export async function verifyAccessToken(token: string): Promise<CognitoAccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwksResolver(), {
      issuer: getCognitoIssuerUrl(),
      algorithms: ['RS256'],
    })
    const claims = payload as CognitoAccessTokenClaims
    if (claims.token_use !== 'access') return null
    if (claims.client_id !== getCognitoClientId()) return null
    if (typeof claims.sub !== 'string' || claims.sub.length === 0) return null
    return claims
  } catch {
    // Invalid, expired, malformed, or misconfigured: fail closed.
    return null
  }
}

/**
 * Verify a Cognito ID token (signature, issuer, audience). ID tokens carry
 * `aud` = app client id and the identity claims used for display.
 */
export async function verifyIdToken(token: string): Promise<CognitoIdTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwksResolver(), {
      issuer: getCognitoIssuerUrl(),
      audience: getCognitoClientId(),
      algorithms: ['RS256'],
    })
    const claims = payload as CognitoIdTokenClaims
    if (claims.token_use !== 'id') return null
    return claims
  } catch {
    return null
  }
}
