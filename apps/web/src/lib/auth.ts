import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyAccessToken, verifyIdToken, COMPANY_ID_CLAIM, type CognitoAccessTokenClaims } from './jwt'
import { AUTH_COOKIES } from './oauth'

/**
 * Server-side session helpers (Next.js server components and route
 * handlers only — `next/headers` is not available in middleware, which
 * uses `lib/jwt.ts` directly).
 *
 * The identity in the cookies is owned by WI-008's Cognito stack: the
 * access token is the credential the API verifier (WI-003) accepts, and
 * `custom:company_id` is the tenant scope.
 */

export interface OperatorSession {
  sub: string
  email?: string
  companyId?: string
  accessClaims: CognitoAccessTokenClaims
}

/** Read the current operator's session, or null when absent/invalid/expired. */
export async function getSession(): Promise<OperatorSession | null> {
  const store = await cookies()
  const accessToken = store.get(AUTH_COOKIES.accessToken)?.value
  if (!accessToken) return null

  const accessClaims = await verifyAccessToken(accessToken)
  if (!accessClaims) return null

  let email: string | undefined
  const idToken = store.get(AUTH_COOKIES.idToken)?.value
  if (idToken) {
    const idClaims = await verifyIdToken(idToken)
    if (idClaims?.email) email = idClaims.email
  }
  if (!email && accessClaims.email) email = accessClaims.email

  return {
    sub: accessClaims.sub as string,
    email,
    companyId: accessClaims[COMPANY_ID_CLAIM],
    accessClaims,
  }
}

/**
 * The tenant scope for API calls. Returns null when the session is valid
 * but the token predates the `custom:company_id` attribute (post-confirm
 * Lambda backfill) — callers decide how to degrade.
 */
export async function getCompanyId(): Promise<string | null> {
  const session = await getSession()
  return session?.companyId ?? null
}

/**
 * The access token for `Authorization: Bearer` calls to the API
 * (knowledge/tech/api-spec.md). Server-side only — pass it to
 * `apiRequest` as `accessToken`.
 */
export async function getAccessToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(AUTH_COOKIES.accessToken)?.value ?? null
}

/**
 * Session gate for server components: redirects to /login (with `?next=`
 * when the caller knows its path) when there is no valid session.
 */
export async function requireSession(nextPath?: string): Promise<OperatorSession> {
  const session = await getSession()
  if (!session) {
    const target = nextPath
      ? `/login?next=${encodeURIComponent(nextPath)}`
      : '/login'
    redirect(target)
  }
  return session
}
