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
})
