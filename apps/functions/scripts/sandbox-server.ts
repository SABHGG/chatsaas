/**
 * Sandbox entry point: same server as production, but auth is replaced by a
 * stub that mimics verified Cognito claims (sub + custom:company_id), since
 * the real Cognito JWKS is unreachable from the local Floci emulator.
 *
 * Usage:  eval $(floci env) && pnpm exec tsx scripts/sandbox-server.ts
 */
import { createServer } from '../src/server.js'
import type { UserPreHook } from '../src/api/hooks'
import type { CognitoAccessTokenClaims } from '../src/auth/claims'

const SUB = process.env.SANDBOX_USER_SUB ?? 'sandbox-user-1'
const COMPANY_ID = process.env.SANDBOX_COMPANY_ID ?? 'sandbox-company-1'

const sandboxClaims: CognitoAccessTokenClaims = {
  sub: SUB,
  iss: 'https://cognito-idp.us-east-1.amazonaws.com/sandbox',
  aud: 'sandbox-client',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  token_use: 'access',
  client_id: 'sandbox-client',
  'custom:company_id': COMPANY_ID,
}

const sandboxUserHook: UserPreHook = async (request) => {
  ;(request as unknown as { user: CognitoAccessTokenClaims }).user =
    sandboxClaims
}

const app = await createServer({
  userPreHook: sandboxUserHook,
  documentsBucket: process.env.DOCUMENTS_BUCKET,
  documentsTable: process.env.DOCUMENTS_TABLE,
  chatbotsTable: process.env.CHATBOTS_TABLE_NAME,
})

const port = Number(process.env.PORT ?? 3001)
await app.listen({ port, host: '127.0.0.1' })
console.log(
  `[sandbox] listening on http://localhost:${port} (stub sub=${SUB}, company=${COMPANY_ID})`
)
