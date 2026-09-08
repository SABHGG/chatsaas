import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, PATCH, POST } from './route'

/**
 * BFF proxy contract (WI-007 Batch B): same-origin requests are
 * forwarded to the backend with the Bearer token attached server-side
 * from the httpOnly cookie, mutation bodies stream unbuffered, the CSRF
 * header is enforced fail-closed, and upstream statuses — 429 included
 * — pass through unmapped so api-errors renders "On hold".
 */

function makeProxyRequest(path: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): NextRequest {
  return new NextRequest(`http://localhost:3000/api/proxy${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.headers,
    body: init?.body,
  })
}

function contextFor(path: string[]) {
  return { params: Promise.resolve({ path }) }
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://api.test/api'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('BFF proxy /api/proxy/[...path]', () => {
  it('forwards GETs upstream with the Bearer token from the httpOnly cookie', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({ data: [] }, { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const request = makeProxyRequest('/chatbots?page=1', {
      headers: { cookie: 'access_token=jwt-from-cookie' },
    })
    const response = await GET(request, contextFor(['chatbots']))

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://api.test/api/chatbots?page=1')
    const headers = init!.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer jwt-from-cookie')
    // The browser's cookies never leak upstream.
    expect(headers.get('Cookie')).toBeNull()
    expect(headers.get('cookie')).toBeNull()
  })

  it('re-attaches its own Bearer token, never a client-supplied one', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({ data: [] }, { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const request = makeProxyRequest('/chatbots', {
      headers: {
        authorization: 'Bearer stolen-token',
        cookie: 'access_token=jwt-from-cookie',
      },
    })
    await GET(request, contextFor(['chatbots']))

    const headers = fetchMock.mock.calls[0]![1]!.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer jwt-from-cookie')
  })

  it('streams mutation bodies unbuffered to the backend', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({ data: null }, { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const request = makeProxyRequest('/chatbots', {
      method: 'POST',
      headers: { 'x-requested-with': 'XMLHttpRequest', 'content-type': 'application/json' },
      body: '{"name":"Front Desk"}',
    })
    await POST(request, contextFor(['chatbots']))

    const [, init] = fetchMock.mock.calls[0]!
    expect(init!.method).toBe('POST')
    // The raw request body stream is forwarded as-is (streaming, not
    // buffering) — the same stream the request carries.
    expect(init!.body).toBe(request.body)
    expect(init!.headers as Headers).not.toBeNull()
  })

  it('rejects mutations without the CSRF header before forwarding anything', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const request = makeProxyRequest('/chatbots', { method: 'POST', body: '{}' })
    const response = await POST(request, contextFor(['chatbots']))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'AUTHORIZATION_ERROR' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('passes a 429 through unmapped so the client renders "On hold"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'RATE_LIMIT_ERROR', path: '/api/chatbots' }, { status: 429 }),
      ),
    )

    const request = makeProxyRequest('/chatbots', { headers: { cookie: 'access_token=jwt' } })
    const response = await GET(request, contextFor(['chatbots']))

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'RATE_LIMIT_ERROR', path: '/api/chatbots' })
  })

  it('returns 404 for path-traversal segments without calling the backend', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const request = makeProxyRequest('/../admin', { headers: { cookie: 'access_token=jwt' } })
    const response = await GET(request, contextFor(['..', 'admin']))

    expect(response.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces backend connection failures as 502 for the operator copy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }))

    const request = makeProxyRequest('/chatbots', { headers: { cookie: 'access_token=jwt' } })
    const response = await GET(request, contextFor(['chatbots']))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'SERVER_ERROR' })
  })

  it('forwards the query string on mutations', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({ data: null }, { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const request = makeProxyRequest('/chatbots?verbose=1', {
      method: 'PATCH',
      headers: { 'x-requested-with': 'XMLHttpRequest' },
      body: '{"name":"New name"}',
    })
    await PATCH(request, contextFor(['chatbots', 'bot-1']))

    const [url] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://api.test/api/chatbots/bot-1?verbose=1')
  })
})
