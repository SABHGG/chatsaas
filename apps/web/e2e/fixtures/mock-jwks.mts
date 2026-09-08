import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose'

/**
 * Mock Cognito User Pool for the WI-007 e2e run (Task 17).
 *
 * Serves the JWKS endpoint the app's edge middleware verifies against
 * (`/.well-known/jwks.json`, jose RS256 keypair) and mints the forged
 * operator token pair at `POST /_tokens` so the Playwright process can
 * sign in purely by setting cookies. Key material never leaves this
 * process. Claims match apps/web/src/lib/jwt.ts expectations:
 *
 *   access: iss, sub, token_use='access', client_id, custom:company_id
 *   id:     iss, sub, aud=<client id>, token_use='id', email
 */

const PORT = Number(process.env.E2E_JWKS_PORT ?? 4312)
const HOST = process.env.E2E_HOST ?? '127.0.0.1'

export const MOCK_ISSUER = process.env.E2E_JWKS_ISSUER ?? `http://${HOST}:${PORT}`
export const MOCK_CLIENT_ID = process.env.E2E_CLIENT_ID ?? 'e2e-client'

const KID = 'e2e-mock-key-1'

interface OperatorSeed {
  sub?: string
  email?: string
  companyId?: string
}

const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true })
const publicJwk = { ...(await exportJWK(publicKey)), kid: KID, use: 'sig', alg: 'RS256' }

async function sign(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer(MOCK_ISSUER)
    .sign(privateKey)
}

async function mintTokens(seed: OperatorSeed): Promise<{ access_token: string; id_token: string }> {
  const sub = seed.sub ?? 'e2e-operator-sub'
  const email = seed.email ?? 'operator@e2e.local'
  const companyId = seed.companyId ?? 'company-e2e'

  const access_token = await sign({
    sub,
    email,
    token_use: 'access',
    client_id: MOCK_CLIENT_ID,
    username: sub,
    'custom:company_id': companyId,
  })
  const id_token = await sign({
    sub,
    email,
    token_use: 'id',
    aud: MOCK_CLIENT_ID,
    'cognito:username': sub,
    'custom:company_id': companyId,
  })
  return { access_token, id_token }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = req.url ?? '/'
  try {
    if (req.method === 'GET' && (url === '/.well-known/jwks.json' || url === '/jwks.json')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ keys: [publicJwk] }))
      return
    }
    if (req.method === 'POST' && url === '/_tokens') {
      const raw = await readBody(req)
      const seed = raw ? (JSON.parse(raw) as OperatorSeed) : {}
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(await mintTokens(seed)))
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: String(err) }))
  }
})

server.listen(PORT, HOST, () => {
  process.stdout.write(`mock JWKS listening on http://${HOST}:${PORT} (issuer ${MOCK_ISSUER})\n`)
})
