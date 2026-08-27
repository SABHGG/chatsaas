import type { FastifyReply, FastifyRequest } from 'fastify'

// Hook signature used by factories to let tests inject a fake user into the
// request before route handlers run. In production this is replaced by real
// auth middleware (e.g. Cognito JWT verification).
export type UserPreHook = (
  request: FastifyRequest,
  reply: FastifyReply,
  next: () => void
) => void

// Convenience: build an onRequest hook that sets request.user.sub.
export function fakeUserHook(sub: string): UserPreHook {
  return (request, _reply, next) => {
    ;(request as any).user = { sub }
    next()
  }
}