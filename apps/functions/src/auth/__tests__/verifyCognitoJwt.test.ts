import { describe, it, expect, beforeEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  createLocalJWKSet,
  type KeyLike,
  type JWK,
} from 'jose'
import { verifyCognitoJwt } from '../verifyCognitoJwt'
import { fakeUserHook } from '../../api/hooks'

/**
 * Tests use `createLocalJWKSet` so verification never hits the network.
 * jose 5.x on Node uses `https.get` directly (not the global `fetch`), so
 * the only way to inject a key in a test without mocking `https` is to
 * use the local JWKS variant. In production the server wires
 * `createRemoteJWKSet` against the Cognito JWKS endpoint.
 */
const REGION = 'us-east-1'
const USER_POOL_ID = 'us-east-1_TestPool'
const CLIENT_ID = 'test-client-id'
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`
const KEY_ID = 'test-kid-1'

let privateKey: KeyLike
let publicJwk: JWK

async function setupKeys() {
  const kp = await generateKeyPair('RS256', { extractable: true })
  privateKey = kp.privateKey
  const jwk = await exportJWK(kp.publicKey)
  jwk.kid = KEY_ID
  jwk.alg = 'RS256'
  jwk.use = 'sig'
  publicJwk = jwk
}

function buildHook(opts: { requireKid?: boolean } = {}) {
  // When `requireKid` is true, the test pins behavior that only matters
  // when the JWKS contains more than one key: a token with no `kid`
  // would otherwise be matched against the only key by `LocalJWKSet`,
  // masking the production behavior of `RemoteJWKSet` (which requires
  // a `kid` match in all cases).
  const keys = opts.requireKid ? [publicJwk, { ...publicJwk, kid: 'other-kid' }] : [publicJwk]
  const jwks = createLocalJWKSet({ keys })
  return verifyCognitoJwt({ jwks, clientId: CLIENT_ID, issuer: ISSUER })
}

function makeToken(overrides: Record<string, unknown> = {}) {
  return new SignJWT({
    token_use: 'access',
    email: 'alice@example.com',
    'custom:company_id': 'co-42',
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setSubject('user-sub-123')
    .sign(privateKey)
}

async function makeApp(hook: ReturnType<typeof verifyCognitoJwt>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  app.addHook('onRequest', hook)
  app.get('/whoami', async (request) => {
    const u = (request as { user?: { sub: string; email?: string; companyId?: string } }).user
    return { sub: u?.sub, email: u?.email, companyId: u?.companyId }
  })
  return app
}

describe('WI-003: verifyCognitoJwt', () => {
  beforeEach(async () => {
    await setupKeys()
  })

  it('accepts a valid access token and populates request.user', async () => {
    const token = await makeToken()
    const app = await makeApp(buildHook())
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.sub).toBe('user-sub-123')
    expect(body.email).toBe('alice@example.com')
    expect(body.companyId).toBe('co-42')

    await app.close()
  })

  it('rejects a missing Authorization header with 401', async () => {
    const app = await makeApp(buildHook())
    const res = await app.inject({ method: 'GET', url: '/whoami' })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHENTICATED')
    await app.close()
  })

  it('rejects a malformed Authorization header with 401', async () => {
    const app = await makeApp(buildHook())
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: 'NotBearer something' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHENTICATED')
    await app.close()
  })

  it('rejects an empty bearer token with 401', async () => {
    const app = await makeApp(buildHook())
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: 'Bearer ' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHENTICATED')
    await app.close()
  })

  it('rejects a token signed with the wrong key with 401', async () => {
    // Generate a SECOND, unrelated keypair and sign with that one. The JWKS
    // we expose is the original keypair, so verification must fail.
    const otherKp = await generateKeyPair('RS256')
    const wrongToken = await new SignJWT({ token_use: 'access' })
      .setProtectedHeader({ alg: 'RS256', kid: 'irrelevant' })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('5m')
      .setSubject('user-sub-123')
      .sign(otherKp.privateKey)

    const app = await makeApp(buildHook())
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${wrongToken}` },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHENTICATED')
    await app.close()
  })

  it('rejects an expired token with 401', async () => {
    const expiredToken = await new SignJWT({ token_use: 'access' })
      .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('-1s')
      .setSubject('user-sub-123')
      .sign(privateKey)

    const app = await makeApp(buildHook())
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${expiredToken}` },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHENTICATED')
    await app.close()
  })

  it('rejects a token with a wrong audience with 401', async () => {
    const wrongAud = await new SignJWT({ token_use: 'access' })
      .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
      .setIssuer(ISSUER)
      .setAudience('some-other-client')
      .setIssuedAt()
      .setExpirationTime('5m')
      .setSubject('user-sub-123')
      .sign(privateKey)

    const app = await makeApp(buildHook())
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${wrongAud}` },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHENTICATED')
    await app.close()
  })

  it('rejects a token with a wrong issuer with 401', async () => {
    const wrongIss = await new SignJWT({ token_use: 'access' })
      .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
      .setIssuer('https://example.com/evil')
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('5m')
      .setSubject('user-sub-123')
      .sign(privateKey)

    const app = await makeApp(buildHook())
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${wrongIss}` },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHENTICATED')
    await app.close()
  })

  it('rejects an id-token (token_use=id) with 401', async () => {
    const idToken = await makeToken({ token_use: 'id' })
    const app = await makeApp(buildHook())
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${idToken}` },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHENTICATED')
    await app.close()
  })

  it('rejects a malformed (non-JWS) token with 401', async () => {
    const app = await makeApp(buildHook())
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: 'Bearer not-a-jwt' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHENTICATED')
    await app.close()
  })

  it('never echoes the underlying jose error message to the client', async () => {
    // The body (what the client sees) is the sanitized message and
    // contains no trace of the underlying JOSE error class name (e.g.
    // "JWTExpired", "JWSSignatureVerificationFailed", etc).
    const expired = await new SignJWT({ token_use: 'access' })
      .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('-1s')
      .setSubject('user-sub-123')
      .sign(privateKey)

    const app = await makeApp(buildHook())
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${expired}` },
    })
    const body = res.json()
    expect(body.error).toBe('Invalid or expired token')
    expect(body.code).toBe('UNAUTHENTICATED')
    expect(JSON.stringify(body)).not.toMatch(/JWTExpired|JWSError|JOSEError/i)
    await app.close()
  })

  it('rejects an HS256 alg-confusion token with 401', async () => {
    // Classic JWT bug: a hostile token that uses HS256 with the public
    // key as the HMAC secret. jose v5 rejects this by default, but the
    // test pins the behavior so an upgrade cannot regress it.
    const sharedSecret = new TextEncoder().encode('whatever-the-attacker-thinks')
    const hsToken = await new SignJWT({ token_use: 'access' })
      .setProtectedHeader({ alg: 'HS256', kid: KEY_ID })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('5m')
      .setSubject('user-sub-123')
      .sign(sharedSecret)

    const app = await makeApp(buildHook())
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${hsToken}` },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHENTICATED')
    await app.close()
  })

  it('rejects a token with no `kid` in the protected header with 401', async () => {
    const noKid = await new SignJWT({ token_use: 'access' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('5m')
      .setSubject('user-sub-123')
      .sign(privateKey)

    // Multi-key JWKS so a missing `kid` cannot accidentally match.
    const app = await makeApp(buildHook({ requireKid: true }))
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${noKid}` },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHENTICATED')
    await app.close()
  })

  it('accepts a token whose `aud` is the configured client in an array', async () => {
    // jose accepts both `aud: string` and `aud: string[]` shapes. This
    // pins that an array containing our client id is still accepted, so
    // multi-audience tokens from upstream proxies do not regress.
    const multiAud = await new SignJWT({ token_use: 'access' })
      .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
      .setIssuer(ISSUER)
      .setAudience([CLIENT_ID, 'some-other-client'])
      .setIssuedAt()
      .setExpirationTime('5m')
      .setSubject('user-sub-123')
      .sign(privateKey)

    const app = await makeApp(buildHook())
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${multiAud}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().sub).toBe('user-sub-123')
    await app.close()
  })

  it('rejects a token whose `nbf` (not-before) is in the future with 401', async () => {
    const futureNbf = await new SignJWT({ token_use: 'access' })
      .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setNotBefore('1h')
      .setExpirationTime('2h')
      .setSubject('user-sub-123')
      .sign(privateKey)

    const app = await makeApp(buildHook())
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${futureNbf}` },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('rejects a token with no `sub` claim with 401', async () => {
    // A token that passes signature, issuer, audience, and token_use
    // checks but lacks `sub` should still be rejected — the downstream
    // handlers rely on `request.user.sub` being a non-empty string.
    const noSub = await new SignJWT({ token_use: 'access' })
      .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)
    // The `sub` setter is the only place SignJWT will set it, so
    // omitting it leaves `sub` undefined. Confirm explicitly:
    const decoded = JSON.parse(
      Buffer.from(noSub.split('.')[1], 'base64url').toString('utf8')
    )
    expect(decoded.sub).toBeUndefined()

    const app = await makeApp(buildHook())
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${noSub}` },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHENTICATED')
    await app.close()
  })

  it('leaves companyId undefined when the token has no custom:company_id', async () => {
    // The verifier should never fabricate a companyId. If the claim is
    // missing, `request.user.companyId` stays undefined (and any
    // tenant-scoping logic must therefore re-derive it server-side from
    // `sub`, not from the token).
    const noCompany = await new SignJWT({
      token_use: 'access',
      email: 'no-company@example.com',
    })
      .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('5m')
      .setSubject('user-sub-no-company')
      .sign(privateKey)

    const app = await makeApp(buildHook())
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${noCompany}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.sub).toBe('user-sub-no-company')
    expect(body.companyId).toBeUndefined()
    await app.close()
  })

  it('does not leak the id-token vs access-token distinction in the response body', async () => {
    // The 401 body for an id token must be byte-identical to the 401
    // body for an expired / wrong-key / wrong-iss token, so a hostile
    // client cannot probe the policy.
    const idToken = await makeToken({ token_use: 'id' })
    const app = await makeApp(buildHook())
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${idToken}` },
    })
    const body = res.json()
    expect(body.error).toBe('Invalid or expired token')
    expect(body.code).toBe('UNAUTHENTICATED')
    expect(JSON.stringify(body)).not.toMatch(/access token|id token/i)
    await app.close()
  })
})

describe('WI-003: verifyCognitoJwt — config validation', () => {
  it('builds a hook when given a valid config', () => {
    const stubJwks: Parameters<typeof verifyCognitoJwt>[0]['jwks'] = (
      async () => new Uint8Array()
    ) as unknown as Parameters<typeof verifyCognitoJwt>[0]['jwks']
    const hook = verifyCognitoJwt({
      jwks: stubJwks,
      clientId: 'abc',
      issuer: 'https://example.com',
    })
    expect(typeof hook).toBe('function')
  })
})

describe('WI-003: verifyCognitoJwt — composes with other hooks', () => {
  it('runs as a preRequest hook after a previous hook has set request.user', async () => {
    await setupKeys()

    const token = await makeToken()
    const verifier = buildHook()
    const app = Fastify({ logger: false })
    // A test-only upstream hook that sets a marker; the verifier must
    // overwrite request.user with the real claims on success.
    app.addHook('onRequest', fakeUserHook('fake-sub'))
    app.addHook('onRequest', verifier)
    app.get('/whoami', async (request) => {
      const u = (request as { user?: { sub: string } }).user
      return { sub: u?.sub }
    })

    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    // The verifier must have replaced the fake sub with the real one.
    expect(res.json().sub).toBe('user-sub-123')
    await app.close()
  })
})
