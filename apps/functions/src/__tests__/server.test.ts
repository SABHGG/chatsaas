import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the lib/db module so no real DynamoDB is needed.
// Each test overrides specific functions via vi.mocked().
vi.mock('@/lib/db', () => ({
  put: vi.fn().mockResolvedValue({}),
  get: vi.fn().mockResolvedValue(undefined),
  scan: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockResolvedValue({}),
  updateExpr: vi.fn().mockResolvedValue({}),
  query: vi.fn().mockResolvedValue([]),
  del: vi.fn().mockResolvedValue(undefined),
  marshal: vi.fn(),
  unmarshal: vi.fn(),
  TABLES: {
    CHAT_MESSAGES: 'chat-messages',
    CREDITS: 'credits',
    PLANS: 'plans',
    SUBSCRIPTIONS: 'subscriptions',
    CONTENT: 'content',
  },
}))

import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  createLocalJWKSet,
  type KeyLike,
  type JWK,
} from 'jose'
import { createServer } from '../server'
import { fakeUserHook } from '../api/hooks'
import { get } from '@/lib/db'

const REGION = 'us-east-1'
const USER_POOL_ID = 'us-east-1_TestPool'
const CLIENT_ID = 'test-client-id'
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`
const KEY_ID = 'test-kid-1'

let privateKey: KeyLike
let publicJwk: JWK

beforeEach(async () => {
  vi.clearAllMocks()
  const kp = await generateKeyPair('RS256', { extractable: true })
  privateKey = kp.privateKey
  const jwk = await exportJWK(kp.publicKey)
  jwk.kid = KEY_ID
  jwk.alg = 'RS256'
  jwk.use = 'sig'
  publicJwk = jwk
})

function buildTestHook() {
  const jwks = createLocalJWKSet({ keys: [publicJwk] })
  return {
    jwks,
    clientId: CLIENT_ID,
    issuer: ISSUER,
  }
}

async function mintToken(sub: string): Promise<string> {
  return new SignJWT({ token_use: 'access', email: `${sub}@example.com` })
    .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setSubject(sub)
    .sign(privateKey)
}

describe('WI-003: server bootstrap', () => {
  it('rejects an admin request with no Authorization header', async () => {
    const fastify = await createServer({
      cognito: buildTestHook(),
      loggerDisabled: true,
    })
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/credits/balance',
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHENTICATED')
    await fastify.close()
  })

  it('accepts an admin request with a valid token and returns 200', async () => {
    ;(get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      userId: 'user-1',
      balance: 42,
    })
    const fastify = await createServer({
      cognito: buildTestHook(),
      loggerDisabled: true,
    })
    const token = await mintToken('user-1')
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/credits/balance',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.success).toBe(true)
    expect(body.data.balance).toBe(42)
    await fastify.close()
  })

  it('rejects an admin request when the token is expired', async () => {
    const fastify = await createServer({
      cognito: buildTestHook(),
      loggerDisabled: true,
    })
    const expired = await new SignJWT({ token_use: 'access' })
      .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('-1s')
      .setSubject('user-1')
      .sign(privateKey)
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/credits/balance',
      headers: { authorization: `Bearer ${expired}` },
    })
    expect(res.statusCode).toBe(401)
    await fastify.close()
  })

  it('serves the public chat surface anonymously with 200', async () => {
    const fastify = await createServer({
      cognito: buildTestHook(),
      loggerDisabled: true,
    })
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/chat/public',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().success).toBe(true)
    expect(Array.isArray(res.json().data)).toBe(true)
    await fastify.close()
  })

  it('serves the public chat surface when a token IS present (idempotent auth)', async () => {
    const fastify = await createServer({
      cognito: buildTestHook(),
      loggerDisabled: true,
    })
    const token = await mintToken('user-1')
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/chat/public',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    await fastify.close()
  })

  it('exposes a /healthz endpoint that always returns 200', async () => {
    const fastify = await createServer({
      cognito: buildTestHook(),
      loggerDisabled: true,
    })
    const res = await fastify.inject({ method: 'GET', url: '/healthz' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await fastify.close()
  })

  it('rejects startup when neither cognito nor userPreHook is provided', async () => {
    await expect(
      createServer({ loggerDisabled: true })
    ).rejects.toThrow(/auth hook/)
  })

  it('allows injecting a pre-built userPreHook (for tests and edge runtimes)', async () => {
    ;(get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      userId: 'user-test',
      balance: 7,
    })
    const fastify = await createServer({
      userPreHook: fakeUserHook('user-test'),
      loggerDisabled: true,
    })
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/credits/balance',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.balance).toBe(7)
    await fastify.close()
  })

  it('returns 400 on invalid request bodies via the centralized error handler', async () => {
    const fastify = await createServer({
      userPreHook: fakeUserHook('user-1'),
      loggerDisabled: true,
    })
    // creditsDebit expects { amount: integer >= 1 }. We send a string.
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/credits/debit',
      headers: { authorization: 'Bearer ignored' },
      payload: { amount: 'not-a-number' },
    })
    expect(res.statusCode).toBe(400)
    await fastify.close()
  })

  it('responds to a CORS preflight on an admin route with the expected origin', async () => {
    // The allowlist defaults to `*` in tests, so credentials are
    // disabled and we only assert the origin reflection. The
    // credentials-enabled path is covered in production-config tests
    // (out of scope here to keep the default config simple).
    const fastify = await createServer({
      cognito: buildTestHook(),
      allowedOrigins: 'https://app.example.com,https://admin.example.com',
      loggerDisabled: true,
    })
    const res = await fastify.inject({
      method: 'OPTIONS',
      url: '/api/credits/balance',
      headers: {
        origin: 'https://app.example.com',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    })
    expect(res.statusCode).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://app.example.com'
    )
    await fastify.close()
  })

  it('reflects the request origin when allowlist is wildcard', async () => {
    // The @fastify/cors plugin reflects the concrete origin (not the
    // literal `*`) when the allowlist is a wildcard. This is the
    // modern, spec-correct behavior; credentialed requests would be
    // rejected by the browser in this mode (we set `credentials: false`
    // when `*` is in the allowlist).
    const fastify = await createServer({
      cognito: buildTestHook(),
      loggerDisabled: true,
    })
    const res = await fastify.inject({
      method: 'OPTIONS',
      url: '/api/credits/balance',
      headers: {
        origin: 'https://app.example.com',
        'access-control-request-method': 'GET',
      },
    })
    expect(res.statusCode).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://app.example.com'
    )
    expect(res.headers['access-control-allow-credentials']).toBeUndefined()
    await fastify.close()
  })

  it('returns 404 for routes that are not mounted', async () => {
    const fastify = await createServer({
      cognito: buildTestHook(),
      loggerDisabled: true,
    })
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/does-not-exist',
    })
    expect(res.statusCode).toBe(404)
    await fastify.close()
  })

  it('rejects an admin request when the userPreHook succeeds but the user has no sub', async () => {
    // This pins the defense-in-depth check in admin handlers: even if
    // the auth hook sets `request.user`, the handler must reject when
    // `sub` is missing (the Cognito verifier already returns 401 in
    // that case, but a custom hook in production could be lax).
    const fastify = await createServer({
      // userPreHook that sets a user without `sub` (malformed hook).
      userPreHook: fakeUserHook(''),
      loggerDisabled: true,
    })
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/credits/balance',
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHENTICATED')
    await fastify.close()
  })

  it('rejects startup when ALLOWED_ORIGINS mixes a wildcard with concrete origins', async () => {
    // WI-003 round 2 fix: silent credentials-off on mixed allowlists.
    await expect(
      createServer({
        cognito: buildTestHook(),
        allowedOrigins: 'https://app.example.com,*',
        loggerDisabled: true,
      })
    ).rejects.toThrow(/mixing '\*' with concrete origins/)
  })

  it('treats an empty allowedOrigins as the wildcard default', async () => {
    // WI-003 round 2 fix: empty allowlist was producing `[]` and
    // locking every origin out with no log line.
    const fastify = await createServer({
      cognito: buildTestHook(),
      allowedOrigins: '',
      loggerDisabled: true,
    })
    const res = await fastify.inject({
      method: 'OPTIONS',
      url: '/api/credits/balance',
      headers: {
        origin: 'https://anything.example.com',
        'access-control-request-method': 'GET',
      },
    })
    expect(res.statusCode).toBe(204)
    // Empty falls through to wildcard, so the request origin is
    // reflected (the @fastify/cors behavior under cb(null, true) +
    // credentials: false).
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://anything.example.com'
    )
    expect(res.headers['access-control-allow-credentials']).toBeUndefined()
    await fastify.close()
  })

  it('rejects a preflight from a non-allowlisted origin with no CORS header', async () => {
    // Pin the cb(null, false) path: an `OPTIONS` from a foreign origin
    // must not carry any Access-Control-Allow-Origin header. A future
    // refactor that changes this back to cb(new Error(...)) would
    // route into the central error handler and return a 500 — silently
    // wrong.
    const fastify = await createServer({
      cognito: buildTestHook(),
      allowedOrigins: 'https://app.example.com',
      loggerDisabled: true,
    })
    const res = await fastify.inject({
      method: 'OPTIONS',
      url: '/api/credits/balance',
      headers: {
        origin: 'https://evil.example.com',
        'access-control-request-method': 'GET',
      },
    })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
    await fastify.close()
  })
})
