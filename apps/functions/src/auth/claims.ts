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
 *
 * SECURITY NOTE (revised for WI-005) — `custom:company_id` IS the tenant
 * authorization source for write paths. The chain of custody is:
 *   (1) the WI-008 post-confirmation Lambda is the sole writer of the
 *       immutable `custom:company_id` attribute,
 *   (2) the SignUp form and the UserPoolClient `writeAttributes` whitelist
 *       exclude the attribute (AC-13), and
 *   (3) no other IAM principal in the stack has
 *       `cognito-idp:AdminUpdateUserAttributes` on the User Pool (AC-14).
 * `resolveTenant` reads the claim and treats it as the authoritative
 * `companyId`. **The `company_id/` and `chatbot_id/` S3 key prefix in the
 * upload path is a hint, not authority**; the IngestLambda re-resolves
 * ownership from the Document row before any Bedrock or Aurora call.
 * Body or query field overrides of `companyId` or `chatbotId` MUST be
 * ignored — `resolveTenant`'s unit test asserts this and is a release
 * blocker.
 */
export interface AuthenticatedUser {
  sub: string
  email?: string
  companyId?: string
  raw: CognitoAccessTokenClaims
}
