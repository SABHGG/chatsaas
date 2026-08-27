import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * Hook signature used by factories to populate `request.user` before route
 * handlers run.
 *
 * The real verifier (see `auth/verifyCognitoJwt.ts`) is async — it issues
 * an HTTP request to Cognito's JWKS endpoint on the first call and then
 * returns a Promise. Fastify supports async onRequest hooks natively, so
 * `UserPreHook` is intentionally written to allow either a callback or an
 * async function. The legacy `next: () => void` parameter is kept so old
 * test-only hooks (e.g. `fakeUserHook`) keep compiling.
 */
export type UserPreHook = (
  request: FastifyRequest,
  reply: FastifyReply,
  next?: () => void
) => void | Promise<void>

/**
 * Test-only hook. In production this is replaced by the Cognito JWT
 * verifier (see `auth/verifyCognitoJwt.ts`).
 */
export function fakeUserHook(sub: string): UserPreHook {
  return (request, _reply, next) => {
    ;(request as unknown as { user: { sub: string } }).user = { sub }
    if (next) next()
  }
}