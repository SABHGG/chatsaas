import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet, apiPost } from './api-client'
import { ApiError } from './api-errors'
import { z } from 'zod'

/**
 * Contract guard for the API client (WI-007 Task 3): Zod-validated
 * `data` envelopes and the CSRF header on mutations (R-7).
 */

const dataSchema = z.object({ id: z.string() })

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://api.test/api'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api-client', () => {
  it('mutations carry X-Requested-With: XMLHttpRequest', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({ data: { id: 'b-1' } }, { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apiPost('/chatbots', dataSchema, { body: { name: 'Front desk' } })

    const [, init] = fetchMock.mock.calls[0]!
    expect((init!.headers as Record<string, string>)['X-Requested-With']).toBe('XMLHttpRequest')
  })

  it('GET requests do not carry the CSRF header and validate the data envelope', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({ data: [{ id: 'b-1' }] }, { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiGet('/chatbots', z.array(dataSchema))

    const [, init] = fetchMock.mock.calls[0]!
    expect((init!.headers as Record<string, string>)['X-Requested-With']).toBeUndefined()
    expect(result).toEqual([{ id: 'b-1' }])
  })

  it('renders HTTP 429 as the line-vocabulary "On hold" ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'RATE_LIMIT_ERROR', path: '/api/chatbots', timestamp: new Date().toISOString() }, { status: 429 }),
      ),
    )

    const err = await apiGet('/chatbots', dataSchema).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(429)
    expect((err as ApiError).message).toBe('On hold')
  })

  it('surfaces non-JSON error bodies with the status-based operator message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gateway timeout', { status: 504 })))

    const err = await apiGet('/chatbots', dataSchema).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(504)
    expect((err as ApiError).message).toBeTruthy()
  })
})
