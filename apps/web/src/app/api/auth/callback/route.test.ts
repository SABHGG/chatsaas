import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

/**
 * Route tests for the OAuth2 callback (WI-007 Task 5):
 * happy path, invalid code, and state mismatch. The token exchange hits
 * the Cognito OAuth2 token endpoint over fetch, so fetch is stubbed —
 * no AWS SDK involved.
 */

const TEST_DOMAIN = 'test-pool.auth.us-east-1.amazoncognito.com'
const TEST_CLIENT_ID = 'test-client-id'
const TOKEN_SET = {
  access_token: 'access-token-jwt',
  id_token: 'id-token-jwt',
  refresh_token: 'refresh-token-jwt',
  token_type: 'Bearer',
  expires_in: 3600,
}

function makeCallbackRequest(query: string, cookie: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/auth/callback?${query}`, {
    headers: { cookie },
  })
}

function setCookiesOf(response: Response): string[] {
  return response.headers.getSetCookie()
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_COGNITO_DOMAIN', TEST_DOMAIN)
  vi.stubEnv('NEXT_PUBLIC_COGNITO_CLIENT_ID', TEST_CLIENT_ID)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('GET /api/auth/callback', () => {
  it('happy path: exchanges the code, sets HttpOnly token cookies, and redirects to the originally-requested page', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL, _init?: RequestInit): Promise<Response> =>
        Response.json(TOKEN_SET, { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const request = makeCallbackRequest(
      'code=auth-code&state=state-123',
      'oauth_state=state-123; pkce_verifier=verifier-123; auth_next=%2Fboard%2Fchatbots%2Fnew',
    )
    const response = await GET(request)

    // Redirects to the sanitized `auth_next` value.
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/board/chatbots/new')

    // The exchange went to the Cognito OAuth2 token endpoint with PKCE.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`https://${TEST_DOMAIN}/oauth2/token`)
    const body = String(init.body)
    expect(body).toContain('grant_type=authorization_code')
    expect(body).toContain('code=auth-code')
    expect(body).toContain('code_verifier=verifier-123')
    expect(body).toContain(`client_id=${TEST_CLIENT_ID}`)

    // Binding cookie names, HTTP-only.
    const setCookies = setCookiesOf(response).join('\n')
    expect(setCookies).toMatch(/id_token=id-token-jwt/)
    expect(setCookies).toMatch(/access_token=access-token-jwt/)
    expect(setCookies).toMatch(/refresh_token=refresh-token-jwt/)
    expect(setCookies).toContain('HttpOnly')

    // Flow cookies are cleared after success.
    expect(setCookies).toMatch(/oauth_state=;/)
    expect(setCookies).toMatch(/pkce_verifier=;/)
  })

  it('invalid code: the token endpoint refuses the exchange, no tokens are set, and the operator lands back on /login', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: 'invalid_grant' }, { status: 400 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const request = makeCallbackRequest(
      'code=bad-code&state=state-123',
      'oauth_state=state-123; pkce_verifier=verifier-123',
    )
    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/login?error=invalid_code')

    const setCookies = setCookiesOf(response).join('\n')
    expect(setCookies).not.toMatch(/id_token=/)
    expect(setCookies).not.toMatch(/access_token=access-/)
    expect(setCookies).not.toMatch(/refresh_token=refresh-/)
  })

  it('state mismatch: a response this browser did not start is rejected before any token request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const request = makeCallbackRequest(
      'code=auth-code&state=forged-state',
      'oauth_state=state-123; pkce_verifier=verifier-123',
    )
    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/login?error=state_mismatch')
    // Fail closed: no token endpoint call was ever attempted.
    expect(fetchMock).not.toHaveBeenCalled()

    const setCookies = setCookiesOf(response).join('\n')
    expect(setCookies).not.toMatch(/id_token=/)
    expect(setCookies).not.toMatch(/access_token=access-/)
  })
})
