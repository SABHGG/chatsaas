import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  createRemoteJWKSet,
  jwtVerify,
  errors as joseErrors,
  type JWTVerifyGetKey,
} from 'jose'
import type { AuthenticatedUser, CognitoAccessTokenClaims } from './claims'
import type { UserPreHook } from '../api/hooks'

/**
 * The shape of a JWKS resolver. jose exposes this as `JWTVerifyGetKey`
 * and accepts both the remote and local variants through the same
 * signature, which is what we use here.
 */
export type JwksResolver = JWTVerifyGetKey

/**
 * Configuration for the Cognito JWT verifier.
 *
 * The hook is a factory: pass it the issuer, audience and JWKS resolver
 * once at server bootstrap, and the returned `UserPreHook` can be
 * attached to every admin route. The JWKS is fetched lazily on first
 * request and cached by `jose` for `cacheMaxAge` (10 minutes by default) —
 * cold start cost on Lambda is therefore one HTTP call per cold instance,
 * not per request.
 */
export interface CognitoVerifierConfig {
  /** JWKS resolver (e.g. `createRemoteJWKSet(...)` from jose). */
  jwks: JwksResolver
  /** Cognito app client id. Used as the JWT `aud` claim. */
  clientId: string
  /**
   * Expected `iss` claim. For Cognito this is normally
   * `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`.
   */
  issuer: string
}

const BEARER_PREFIX = 'Bearer '

/**
 * Build a Fastify onRequest hook that verifies the `Authorization: Bearer
 * <jwt>` header against a JWKS resolver (Cognito in production). On
 * success, sets `request.user` to the {@link AuthenticatedUser} shape. On
 * failure, returns 401 with a sanitized error body and never leaks the
 * underlying jose error code to the client.
 */
export function verifyCognitoJwt(config: CognitoVerifierConfig): UserPreHook {
  return async function cognitoJwtHook(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    // All 401 responses share a single error body — a hostile client
    // must not be able to tell from the response why their token was
    // rejected (missing header vs. empty bearer vs. invalid signature
    // vs. wrong audience vs. expired vs. id-token vs. missing sub).
    // The diagnostic details stay in the structured log line, never in
    // the response.
    const unauthorized = () =>
      reply.code(401).send({
        success: false,
        error: 'Invalid or expired token',
        code: 'UNAUTHENTICATED',
      })

    const header = request.headers.authorization
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      request.log.warn('cognito jwt rejected: missing or malformed Authorization header')
      return unauthorized()
    }

    const token = header.slice(BEARER_PREFIX.length).trim()
    if (!token) {
      request.log.warn('cognito jwt rejected: empty bearer token')
      return unauthorized()
    }

    let claims: CognitoAccessTokenClaims
    try {
      const result = await jwtVerify(token, config.jwks, {
        issuer: config.issuer,
        audience: config.clientId,
      })
      claims = result.payload as unknown as CognitoAccessTokenClaims
    } catch (err) {
      request.log.warn(
        { err: sanitizeError(err) },
        'cognito jwt verification failed'
      )
      return unauthorized()
    }

    if (claims.token_use !== 'access') {
      // Log distinguishes id vs access for ops so CloudWatch queries
      // can find customers that misconfigured an id-token flow; the
      // response body is byte-identical to the other 401s (no leak).
      request.log.warn(
        { tokenUse: claims.token_use },
        'cognito jwt rejected: not an access token'
      )
      return unauthorized()
    }

    if (
      typeof claims.sub !== 'string' ||
      claims.sub.length === 0 ||
      claims.sub.trim().length === 0
    ) {
      // Cognito access tokens always carry a non-empty `sub`; an absent
      // one (or whitespace-only) means a misconfigured client or a
      // forged token that bypassed the issuer check. Fail closed here
      // so downstream handlers never see an empty
      // `request.user.sub`.
      request.log.warn('cognito jwt rejected: missing or empty sub claim')
      return unauthorized()
    }

    const user: AuthenticatedUser = {
      sub: claims.sub,
      email: claims.email,
      companyId: claims['custom:company_id'],
      raw: claims,
    }
    ;(request as unknown as { user: AuthenticatedUser }).user = user
  }
}

/**
 * Convenience constructor: builds a CognitoVerifierConfig from a Cognito
 * region + user pool id, wiring `createRemoteJWKSet` against the standard
 * Cognito JWKS endpoint. Keeps production code paths declarative.
 */
export function cognitoConfigForCognito(
  region: string,
  userPoolId: string,
  clientId: string
): CognitoVerifierConfig {
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
    cacheMaxAge: 10 * 60 * 1000,
    cooldownDuration: 30 * 1000,
    timeoutDuration: 5_000,
  })
  return { jwks, clientId, issuer }
}

/**
 * Returns a short, safe string representation of a verification error.
 * jose throws subclasses of `JOSEError` with descriptive names that are
 * fine to log but should never be reflected to the client (they can hint
 * at misconfiguration like a wrong audience or expired token).
 */
function sanitizeError(err: unknown): { name: string; message: string } {
  if (err instanceof joseErrors.JOSEError) {
    return { name: err.name, message: err.message }
  }
  if (err instanceof Error) {
    return { name: err.name, message: err.message }
  }
  return { name: 'UnknownError', message: String(err) }
}
