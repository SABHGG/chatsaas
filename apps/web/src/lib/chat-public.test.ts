import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PUBLIC_CHAT_RETRY_DELAY_MS,
  PublicChatError,
  VISITOR_ERROR_COPY,
  fetchPublicChatbot,
  sendPublicChatMessage,
  visitorCopyFor,
} from './chat-public'

/**
 * T-01 contract pins: the two public endpoints, zod-validated, and the
 * status → visitor-copy map. The visitor NEVER sees a status code, an
 * error class, or backend vocabulary (R-3) — only the calm copy map.
 */

const CONFIG_BODY = {
  success: true,
  data: {
    chatbotId: 'bot-1',
    name: 'Front Desk',
    status: 'published',
    expires_at: null,
  },
}

const MESSAGE_BODY = {
  data: {
    answer: 'The flat white is 4.50.',
    conversation_id: '0c1c9f52-1d60-4a3e-9d3e-6d1c34a7b921',
    sources: [{ id: 'chunk-1', content: 'Flat white — 4.50', score: 0.92 }],
  },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function fetchMock(handler: () => Promise<Response> | Response): ReturnType<typeof vi.fn> {
  const mock = vi.fn(handler)
  vi.stubGlobal('fetch', mock)
  return mock
}

/** Await a call that must fail, and hand back the typed visitor error. */
async function catchChatError(call: Promise<unknown>): Promise<PublicChatError> {
  try {
    await call
    throw new Error('expected the message call to fail')
  } catch (err) {
    return err as PublicChatError
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchPublicChatbot', () => {
  it('parses the published config envelope', async () => {
    fetchMock(() => jsonResponse(CONFIG_BODY))
    const chatbot = await fetchPublicChatbot('bot-1', { baseUrl: 'http://api.test/api' })
    expect(chatbot).toEqual({
      chatbotId: 'bot-1',
      name: 'Front Desk',
      status: 'published',
      expires_at: null,
    })
  })

  it('hits the real public config route on the API base', async () => {
    const mock = fetchMock(() => jsonResponse(CONFIG_BODY))
    await fetchPublicChatbot('bot-1', { baseUrl: 'http://api.test/api' })
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://api.test/api/public/chatbots/bot-1/config')
    expect(init.credentials).toBe('omit')
  })

  it('returns null for every not-available case (404, non-published, malformed)', async () => {
    const notFound = fetchMock(() => new Response('{"error":"Chatbot not found"}', { status: 404 }))
    expect(await fetchPublicChatbot('bot-1')).toBeNull()

    notFound.mockImplementation(() =>
      new Response(JSON.stringify({ success: true, data: { chatbotId: 'bot-1', name: 'X', status: 'draft', expires_at: null } }), { status: 200 }),
    )
    await expect(fetchPublicChatbot('bot-1')).resolves.toBeNull()

    notFound.mockImplementation(() => new Response('not json', { status: 200 }))
    await expect(fetchPublicChatbot('bot-1')).resolves.toBeNull()

    notFound.mockImplementation(() => {
      throw new Error('network down')
    })
    await expect(fetchPublicChatbot('bot-1')).resolves.toBeNull()
  })
})

describe('sendPublicChatMessage', () => {
  it('returns the grounded answer, conversation id, and sources', async () => {
    fetchMock(() => jsonResponse(MESSAGE_BODY))
    const result = await sendPublicChatMessage('bot-1', { message: 'How much is a flat white?' })
    expect(result.answer).toBe('The flat white is 4.50.')
    expect(result.sources).toHaveLength(1)
    expect(result.conversationId).toBe('0c1c9f52-1d60-4a3e-9d3e-6d1c34a7b921')
  })

  it('sends an anonymous POST to the API base directly (never the BFF proxy)', async () => {
    const mock = fetchMock(() => jsonResponse(MESSAGE_BODY))
    await sendPublicChatMessage('bot-1', { message: 'How much is a flat white?' }, { baseUrl: 'http://api.test/api' })

    expect(mock).toHaveBeenCalledTimes(1)
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://api.test/api/public/chat/bot-1/message')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit') // no cookies on the visitor surface (R-5)
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined() // no Bearer — anonymous
    expect(headers['X-Requested-With']).toBeUndefined() // not the authed BFF contract
    expect(JSON.parse(String(init.body))).toEqual({ message: 'How much is a flat white?' })
  })

  it('carries the client conversation id through as conversation_id', async () => {
    const mock = fetchMock(() => jsonResponse(MESSAGE_BODY))
    await sendPublicChatMessage('bot-1', { message: 'again', conversationId: '7b7c9f42-1d3e-4b3e-9c2f-1b7c9f421d3e' })
    const body = JSON.parse((mock.mock.calls[0]![1] as RequestInit).body as string) as {
      conversation_id?: string
    }
    expect(body.conversation_id).toBe('7b7c9f42-1d3e-4b3e-9c2f-1b7c9f421d3e')
  })

  it('maps 402 to the plan-limit copy and never leaks the status', async () => {
    fetchMock(() => new Response('{}', { status: 402 }))
    const err = await catchChatError(sendPublicChatMessage('bot-1', { message: 'hi' }))
    expect(err).toBeInstanceOf(PublicChatError)
    expect(err.kind).toBe('plan-limit')
    expect(err.message).toBe(VISITOR_ERROR_COPY['plan-limit'])
    expect(err.message).not.toMatch(/\b402\b/)
  })

  it('maps 429 to the rate-limit copy', async () => {
    fetchMock(() => new Response('{}', { status: 429 }))
    const err = await catchChatError(sendPublicChatMessage('bot-1', { message: 'hi' }))
    expect(err).toBeInstanceOf(PublicChatError)
    expect(err.kind).toBe('rate-limit')
  })

  it('maps 5xx to a transient unavailable error', async () => {
    fetchMock(() => new Response('{}', { status: 500 }))
    const err = await catchChatError(sendPublicChatMessage('bot-1', { message: 'hi' }))
    expect(err.kind).toBe('unavailable')
    expect(err.transient).toBe(true)
  })

  it('maps fetch rejection (offline) to the network kind', async () => {
    fetchMock(() => {
      throw new TypeError('fetch failed')
    })
    const err = await catchChatError(sendPublicChatMessage('bot-1', { message: 'hi' }))
    expect(err).toBeInstanceOf(PublicChatError)
    expect(err.kind).toBe('network')
    expect(err.transient).toBe(true)
  })

  it('treats a malformed success body as unavailable', async () => {
    fetchMock(() => new Response(JSON.stringify({ data: { answer: 42 } }), { status: 200 }))
    const err = await catchChatError(sendPublicChatMessage('bot-1', { message: 'hi' }))
    expect(err).toBeInstanceOf(PublicChatError)
    expect(err.kind).toBe('unavailable')
  })
})

describe('visitor copy contract (R-3)', () => {
  it('never exposes status codes, error classes, or infrastructure vocabulary', () => {
    for (const copy of Object.values(VISITOR_ERROR_COPY)) {
      expect(copy).not.toMatch(/\b\d{3}\b/) // no status codes
      expect(copy).not.toMatch(/error|exception|AWS|Lambda|gateway|server|credit|plan_id|billing/i)
      expect(copy).not.toMatch(/company (didn'?t|failed|did not)/i)
    }
  })

  it('says the plan limit calmly, without naming credits or money', () => {
    expect(VISITOR_ERROR_COPY['plan-limit']).toMatch(/plan limit/i)
  })

  it('keeps one copy line per kind, stable for the visitor', () => {
    expect(visitorCopyFor('rate-limit')).toBe(VISITOR_ERROR_COPY['rate-limit'])
  })

  it('documents the automatic-retry window', () => {
    expect(PUBLIC_CHAT_RETRY_DELAY_MS).toBeGreaterThan(0)
  })
})
