// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ChatClient } from './chat-client'
import { ChatUnavailable } from './chat-unavailable'
import PublicChatPage from './page'

/**
 * WI-009 T-06 — the public page and every visitor state, against stubbed
 * fetch: not published (neutral state), ready, plan-limit (402), rate-limit
 * (429), transient network failure with one automatic retry then the
 * manual retry, plain-text (XSS-inert) rendering of answers and sources
 * (R-1), and conversation_id kept in memory only (R-5).
 */

const CHATBOT_ID = 'bot-public-1'
const BASE = 'http://api.test/api'
const CONVERSATION_ID = '9c1c9f52-1d60-4a3e-9d3e-6d1c34a7b921'

const CONFIG = {
  success: true,
  data: { chatbotId: CHATBOT_ID, name: 'Front Desk', status: 'published', expires_at: null },
}

const GROUNDED = {
  data: {
    answer: 'The flat white is 4.50.',
    conversation_id: CONVERSATION_ID,
    sources: [
      { id: 'chunk-1', content: 'Flat white — 4.50', score: 0.91 },
      { id: 'chunk-2', content: 'Cortado — 4.00', score: 0.74 },
      { id: 'chunk-3', content: 'Cold brew — 5.00', score: 0.51 },
    ],
  },
}

const MALICIOUS = {
  data: {
    answer: 'Safe answer text.',
    conversation_id: CONVERSATION_ID,
    sources: [
      {
        id: 'chunk-x',
        content: '<script>alert(1)</script><img src=x onerror="alert(2)">',
        score: 0.9,
      },
    ],
  },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>

function stubFetch(handler: FetchHandler): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init))
  vi.stubGlobal('fetch', mock)
  return mock
}

function messageOrConfig(message: Response, config: Response): FetchHandler {
  return (url) => (url.includes('/message') ? Promise.resolve(message) : Promise.resolve(config))
}

async function renderPage(chatbotId = CHATBOT_ID) {
  const ui = await PublicChatPage({ params: Promise.resolve({ chatbotId }) })
  return render(ui)
}

async function ask(question: string): Promise<void> {
  fireEvent.change(screen.getByTestId('visitor-composer'), { target: { value: question } })
  fireEvent.click(screen.getByTestId('visitor-send'))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PublicChatPage — server shell (T-02)', () => {
  it('renders the chat shell for a published bot', async () => {
    stubFetch(messageOrConfig(jsonResponse(GROUNDED), jsonResponse(CONFIG)))
    const { container } = await renderPage()

    // The page itself: the document-top composition around the client island.
    expect(container.querySelector('main.vchat-main')).toBeTruthy()
    expect(screen.getByTestId('visitor-composer')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 })!.textContent).toBe('Front Desk')
    expect(screen.getByTestId('visitor-greeting')!.textContent).toBe(
      'Hi! Ask anything about Front Desk.',
    )
    expect(screen.getByText('Answers from company documents.')).toBeTruthy()
  })

  it('renders the neutral not-available state for an unknown or unpublished id (AC 1)', async () => {
    stubFetch(
      messageOrConfig(
        jsonResponse({ error: 'Chatbot not found' }, 404),
        jsonResponse({ error: 'Chatbot not found' }, 404),
      ),
    )
    const { container } = await renderPage('bot-unknown')

    expect(screen.getByTestId('visitor-unavailable')).toBeTruthy()
    expect(screen.getByTestId('visitor-unavailable').textContent).toContain(
      'isn’t available right now',
    )
    // No status codes, no internals, no blame.
    expect(container.textContent).not.toMatch(/\b404\b/)
    expect(container.textContent).not.toMatch(/unpublished|draft|archived|company|plan/i)
    expect(screen.queryByTestId('visitor-composer')).toBeNull()
  })
})

describe('ChatClient — ask, answer, sources (AC 2)', () => {
  it('greets, asks, and stacks the answered document with folded sources', async () => {
    const mock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')) as {
        conversation_id?: string
      }
      // First turn: no conversation id. Second turn: it comes back.
      if (mock.mock.calls.length > 1 && body.conversation_id !== CONVERSATION_ID) {
        throw new Error('second turn must carry the API conversation id')
      }
      return String(input).includes('/message') ? jsonResponse(GROUNDED) : jsonResponse(CONFIG)
    })
    vi.stubGlobal('fetch', mock)

    render(<ChatClient name="Front Desk" chatbotId={CHATBOT_ID} baseUrl={BASE} />)

    expect(screen.getByTestId('visitor-greeting')!.textContent).toBe(
      'Hi! Ask anything about Front Desk.',
    )
    expect((screen.getByLabelText('Ask a question') as HTMLTextAreaElement).value).toBe('')
    expect((screen.getByTestId('visitor-send') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByTestId('visitor-composer'), {
      target: { value: 'How much is a flat white?' },
    })
    expect((screen.getByTestId('visitor-send') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByTestId('visitor-send'))

    // The newest card thinks while the composer rests.
    expect(screen.getByText('Thinking…')).toBeTruthy()
    expect((screen.getByTestId('visitor-send') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('visitor-composer') as HTMLTextAreaElement).disabled).toBe(true)

    // The answer lands on the same card, sources folded beneath it.
    await screen.findByTestId('visitor-answer')
    expect(screen.getByTestId('visitor-answer').textContent).toContain('flat white is 4.50')
    const card = screen.getByTestId('visitor-card')
    expect(card.textContent).toContain('How much is a flat white?')

    const sources = card.querySelector('[data-testid="visitor-sources"]') as HTMLDetailsElement
    expect(sources.querySelector('summary')!.textContent).toContain('Sources (3)')
    expect(sources.open).toBe(false) // collapsed by default
    sources.open = true
    expect(sources.textContent).toContain('Flat white — 4.50')
    expect(sources.textContent).toContain('Cold brew — 5.00')
  })

  it('sends the second turn with the conversation id the API returned', async () => {
    const mock = vi.fn(async (input: unknown, init?: RequestInit) => {
      void input
      const body = JSON.parse(String((init as RequestInit).body ?? '{}')) as {
        conversation_id?: string
      }
      if (mock.mock.calls.length === 1) expect(body.conversation_id).toBeUndefined()
      if (mock.mock.calls.length === 2) expect(body.conversation_id).toBe(CONVERSATION_ID)
      return jsonResponse(GROUNDED)
    })
    vi.stubGlobal('fetch', mock)

    render(<ChatClient name="Front Desk" chatbotId={CHATBOT_ID} baseUrl={BASE} />)
    fireEvent.change(screen.getByTestId('visitor-composer'), { target: { value: 'First question' } })
    fireEvent.click(screen.getByTestId('visitor-send'))
    await screen.findByTestId('visitor-answer')

    fireEvent.change(screen.getByTestId('visitor-composer'), { target: { value: 'Second question' } })
    fireEvent.click(screen.getByTestId('visitor-send'))
    await waitFor(() => expect(mock.mock.calls).toHaveLength(2))
  })

  it('keeps the conversation id in memory only — storage stays empty (R-5)', async () => {
    stubFetch(messageOrConfig(jsonResponse(GROUNDED), jsonResponse(CONFIG)))
    render(<ChatClient name="Front Desk" chatbotId={CHATBOT_ID} baseUrl={BASE} />)
    fireEvent.change(screen.getByTestId('visitor-composer'), { target: { value: 'Hello there' } })
    fireEvent.click(screen.getByTestId('visitor-send'))
    await screen.findByTestId('visitor-answer')

    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('renders answers and sources as inert plain text (R-1: stored XSS stays text)', async () => {
    stubFetch(messageOrConfig(jsonResponse(MALICIOUS), jsonResponse(CONFIG)))
    const { container } = render(
      <ChatClient name="Front Desk" chatbotId={CHATBOT_ID} baseUrl={BASE} />,
    )
    fireEvent.change(screen.getByTestId('visitor-composer'), { target: { value: 'What is this?' } })
    fireEvent.click(screen.getByTestId('visitor-send'))
    await screen.findByTestId('visitor-answer')

    expect(container.querySelectorAll('script')).toHaveLength(0)
    expect(container.querySelectorAll('img')).toHaveLength(0)
    const sources = container.querySelector('[data-testid="visitor-sources"]') as HTMLDetailsElement
    sources.open = true
    // The payload survives only as text, never as markup.
    expect(sources.textContent).toContain('<script>alert(1)</script>')
    expect(sources.textContent).toContain('<img src=x onerror="alert(2)">')
  })
})

describe('ChatClient — honest failure states (AC 3, AC 4)', () => {
  it('renders the plan-limit (402) copy: no retry button, no status, no blame', async () => {
    stubFetch(messageOrConfig(jsonResponse({}, 402), jsonResponse(CONFIG)))
    render(<ChatClient name="Front Desk" chatbotId={CHATBOT_ID} baseUrl={BASE} />)
    fireEvent.change(screen.getByTestId('visitor-composer'), { target: { value: 'One more' } })
    fireEvent.click(screen.getByTestId('visitor-send'))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/plan limit/i)
    expect(document.body.textContent).not.toContain('402')
    expect(document.body.textContent).not.toMatch(/credit|billing/i)
    expect(screen.queryByTestId('visitor-retry')).toBeNull() // retrying cannot help
    // The composer still works — the visitor can ask something else.
    expect((screen.getByTestId('visitor-composer') as HTMLTextAreaElement).disabled).toBe(false)
  })

  it('renders the rate-limit (429) copy with a manual retry', async () => {
    stubFetch(messageOrConfig(jsonResponse({}, 429), jsonResponse(CONFIG)))
    render(<ChatClient name="Front Desk" chatbotId={CHATBOT_ID} baseUrl={BASE} />)
    fireEvent.change(screen.getByTestId('visitor-composer'), { target: { value: 'Quick one' } })
    fireEvent.click(screen.getByTestId('visitor-send'))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/too many messages/i)
    expect(document.body.textContent).not.toContain('429')
    expect(screen.getByTestId('visitor-retry')).toBeTruthy()
  })

  it('retries a transient failure once automatically, then offers the manual retry (AC 3)', async () => {
    let messageCalls = 0
    const mock = vi.fn(async (input: unknown) => {
      void input
      messageCalls += 1
      if (messageCalls <= 2) throw new TypeError('fetch failed') // initial + the ONE auto retry
      return jsonResponse(GROUNDED)
    })
    vi.stubGlobal('fetch', mock)

    render(<ChatClient name="Front Desk" chatbotId={CHATBOT_ID} baseUrl={BASE} />)
    fireEvent.change(screen.getByTestId('visitor-composer'), { target: { value: 'Any answer?' } })
    fireEvent.click(screen.getByTestId('visitor-send'))

    // The card keeps thinking through the failure and the automatic retry…
    expect(screen.getByText('Thinking…')).toBeTruthy()
    // …then tells the truth and offers the retry action.
    await screen.findByRole('alert', {}, { timeout: 3000 })
    expect(screen.getByRole('alert').textContent).toMatch(/reach the assistant/i)
    expect(messageCalls).toBe(2) // exactly one automatic retry

    // The manual retry recovers the same question — nothing was dropped.
    fireEvent.click(screen.getByTestId('visitor-retry'))
    await screen.findByTestId('visitor-answer')
    expect(mock.mock.calls).toHaveLength(3)
  })
})

describe('ChatUnavailable — the neutral not-available state (AC 1, R-6)', () => {
  it('renders calm, blame-free copy with no internals', () => {
    const { container } = render(<ChatUnavailable />)
    expect(container.textContent).toContain('This assistant isn’t available right now.')
    expect(container.textContent).toContain('The link may be out of date')
    expect(container.textContent).not.toMatch(/\b\d{3}\b/)
    expect(container.textContent).not.toMatch(/unpublished|draft|archived|error|company/i)
  })

  it('is what the page serves when the public GET comes back empty', async () => {
    stubFetch(async () => new Response('{"error":"Chatbot not found"}', { status: 404 }))
    const { container } = await renderPage()
    expect(screen.getByTestId('visitor-unavailable')).toBeTruthy()
    expect(container.querySelector('[data-testid="visitor-composer"]')).toBeNull()
  })
})
