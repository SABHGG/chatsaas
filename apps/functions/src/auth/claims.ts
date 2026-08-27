/**
 * Cognito JWT claim types.
 *
 * The shape we trust once `jwtVerify` has returned a valid payload. We only
 * keep the fields the rest of the codebase actually reads; any unknown
 * claims are passed through as `unknown` and not used for authorization.
 *
 * - `sub`: Cognito user id (stable, opaque). Becomes `request.user.sub`.
 * - `email`, `email_verified`: standard OIDC claims. Read-only for now.
 * - `token_use`: should be `'access'` for access tokens, `'id'` for id
 *   tokens. Access tokens are what the API should accept.
 * - `custom:company_id`: optional multi-tenant scope we will need later.
 *   Cognito custom claims are surfaced as `custom:<name>` strings.
 */

export type CognitoTokenUse = 'access' | 'id'

export interface CognitoAccessTokenClaims {
  sub: string
  iss: string
  aud: string | string[]
  exp: number
  iat: number
  token_use: CognitoTokenUse
  client_id?: string
  username?: string
  email?: string
  'custom:company_id'?: string
  [key: string]: unknown
}

/**
 * The request.user shape populated by the verifyCognitoJwt hook. Other
 * handlers read `request.user.sub` (and, later, `request.user.companyId`).
 */
export interface AuthenticatedUser {
  sub: string
  email?: string
  companyId?: string
  raw: CognitoAccessTokenClaims
}
