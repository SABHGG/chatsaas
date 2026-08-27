/**
 * Fastify module augmentation: add the `request.user` field populated by
 * the Cognito JWT verifier (see `apps/functions/src/auth/verifyCognitoJwt.ts`).
 *
 * Importing this file once at the entry point of the functions package
 * teaches the type system that `request.user` is a typed property of
 * AuthenticatedUser. All admin handlers can then read `request.user.sub`
 * without an `as` cast.
 */
import 'fastify'
import type { AuthenticatedUser } from '../auth/claims'

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser
  }
}

// Re-export so importing this file for side effects is unambiguous.
export type { AuthenticatedUser }
