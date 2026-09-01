// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { ApiError } from '@/lib/api-errors'

/**
 * WI-007 Task 12 (Index Rail revision): the board renders the index
 * rail — one selectable card per chatbot (name + state lamp) — and the
 * main pane: the fleet glance by default, the selected line's full
 * detail when `?line=<chatbotId>` is in the URL. The page is a Server
 * Component — its data sources (session + API calls) are mocked here so
 * the real fetch→map→render path is exercised.
 */

vi.mock('next/link', () => ({
  default: (props: { href?: string; children?: React.ReactNode } & Record<string, unknown>) => {
    const { href, children, ...rest } = props
    return createElement('a', { href, ...rest }, children)
  },
}))

const refreshSpy = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: refreshSpy }),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect: ${url}`)
  }),
}))

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => ({
    sub: 'op-1',
    email: 'op@example.com',
    companyId: 'co-1',
    accessClaims: {},
  })),
  getAccessToken: vi.fn(async () => 'test-token'),
}))

vi.mock('@/lib/api-client', () => ({
  apiRequest: vi.fn(),
}))

vi.mock('@/lib/bff-request', () => ({
  proxyRequest: vi.fn(async () => ({ balance: 5 })),
}))

import { apiRequest } from '@/lib/api-client'
import { redirect } from 'next/navigation'
import BoardPage from './page'
import ChatbotDetailRedirectPage from './chatbots/[id]/page'

const apiRequestMock = apiRequest as unknown as import('vitest').Mock
const redirectMock = redirect as unknown as import('vitest').Mock

const BOT_DRAFT = {
  id: 'bot-1',
  name: 'Front Desk',
  status: 'draft',
  document_count: 2,
  created_at: '2026-08-31T10:00:00Z',
  updated_at: '2026-08-31T10:00:00Z',
  published_at: null,
}

const BOT_LIVE = {
  id: 'bot-2',
  name: 'Menu Line',
  status: 'published',
  document_count: 5,
  created_at: '2026-08-30T09:00:00Z',
  updated_at: '2026-08-31T11:00:00Z',
  published_at: '2026-08-30T12:00:00Z',
}

const DOC_READY = {
  id: 'doc-1',
  chatbotId: 'bot-1',
  filename: 'front-desk-faq.txt',
  mimeType: 'text/plain',
  byteCount: 2048,
  status: 'ready',
  createdAt: '2026-08-31T10:01:00Z',
  updatedAt: '2026-08-31T10:05:00Z',
}

const PLAN = { id: 'plan-starter', name: 'Starter', description: null, price: 19, interval: 'monthly' }

const PUBLISHED = [
  {
    ...BOT_LIVE,
    url: 'https://chat.chatsaas.local/bot-2',
    iframe_src: 'https://chat.chatsaas.local/bot-2',
  },
]

/** Route the mocked apiRequest by path, the way the page actually calls it. */
function mockApiByPath(): void {
  apiRequestMock.mockImplementation((path: string) => {
    if (path === '/chatbots') return Promise.resolve([BOT_DRAFT, BOT_LIVE])
    if (path === `/chatbots/${BOT_DRAFT.id}/documents`) return Promise.resolve({ documents: [DOC_READY] })
    if (path === '/plans/available') return Promise.resolve([PLAN])
    if (path === '/chatbots/published') return Promise.resolve(PUBLISHED)
    return Promise.reject(new ApiError(500, 'SERVER_ERROR', 'Unexpected API path'))
  })
}

async function renderBoard(searchParams: Record<string, string> = {}) {
  return render(await BoardPage({ searchParams: Promise.resolve(searchParams) }))
}

beforeEach(() => {
  apiRequestMock.mockReset()
  refreshSpy.mockReset()
  redirectMock.mockReset()
})

afterEach(cleanup)

describe('BoardPage — the index rail', () => {
  it('renders one index card per chatbot in the rail, with line states, and the glance pane by default', async () => {
    mockApiByPath()
    await renderBoard()

    // Index cards carry the line names as engraved-plate labels.
    expect(screen.getByText('Front Desk')).toBeTruthy()
    expect(screen.getByText('Menu Line')).toBeTruthy()

    // Lamp states read from the line vocabulary: draft → unplugged,
    // published → live (amber).
    const draftCard = screen.getByText('Front Desk').closest('[data-testid="board-line-link"]')!
    expect(draftCard.getAttribute('data-line-state')).toBe('unplugged')
    const liveCard = screen.getByText('Menu Line').closest('[data-testid="board-line-link"]')!
    expect(liveCard.getAttribute('data-line-state')).toBe('live')
    expect(liveCard.querySelector('[data-testid="rail-lamp"]')!.className).toContain('bg-patch-amber')

    // Selection is carried by the URL, not hidden state.
    const links = screen.getAllByTestId('board-line-link')
    expect(links).toHaveLength(2)
    expect(links[0]!.getAttribute('href')).toBe('/board?line=bot-1')
    expect(links[1]!.getAttribute('href')).toBe('/board?line=bot-2')

    // No selection: the pane is the fleet-at-a-glance summary.
    expect(screen.getByTestId('board-glance')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Your lines' })).toBeTruthy()

    // The create/plug control is the primary action into the wizard; its
    // ground is the deep amber step (raw patch-amber fails the 4.5:1
    // ivory-text contrast floor — raw amber stays on the lamps).
    const plug = screen.getByTestId('plug-new-line')
    expect(plug.getAttribute('href')).toBe('/board/wizard')
    expect(plug.className).toContain('bg-patch-amber-deep')
  })

  it('never plays the publish animation or casts a shadow on a plain board render', async () => {
    mockApiByPath()
    await renderBoard()

    // The live lamp is amber surface — but Flat-by-Default holds: no
    // jack-click animation and no live-jack shadow anywhere in the rail.
    const lamp = screen.getByText('Menu Line').closest('[data-testid="board-line-link"]')!
      .querySelector('[data-testid="rail-lamp"]')! as HTMLElement
    expect(lamp.className).toContain('bg-patch-amber')
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('[data-testid="rail-lamp"]'))) {
      expect(element.className).not.toContain('animate-jack-click')
      expect(element.className).not.toContain('shadow-live-jack')
    }
  })

  it('marks the selected card and opens the line detail pane via ?line=', async () => {
    mockApiByPath()
    await renderBoard({ line: BOT_DRAFT.id })

    // The selected index card is marked for the operator.
    const selected = screen
      .getAllByTestId('board-line-link')
      .find((link) => link.getAttribute('href') === `/board?line=${BOT_DRAFT.id}`)!
    expect(selected.getAttribute('aria-current')).toBe('true')

    // The pane holds the line's full detail: the jack header with the
    // plug control, readiness (ready/total), and the document rows.
    const header = screen.getByTestId('chatbot-detail-header')
    expect(header.querySelector('[data-testid="jack-card"]')!.getAttribute('data-line-state')).toBe('unplugged')
    expect(screen.getByTestId('detail-readiness').textContent).toContain('1 of 1 documents ready')
    expect(screen.getByTestId('detail-document-row').textContent).toContain('front-desk-faq.txt')
    expect(screen.getByTestId('plug-open')).toBeTruthy()

    // A draft line has no embed yet.
    expect(screen.queryByTestId('embed-snippet')).toBeNull()
  })

  it('shows the embed panel when the selected line is live', async () => {
    mockApiByPath()
    await renderBoard({ line: BOT_LIVE.id })

    const header = screen.getByTestId('chatbot-detail-header')
    expect(header.querySelector('[data-testid="jack-card"]')!.getAttribute('data-line-state')).toBe('live')
    // The state pill lives on the jack card's trailing edge — exactly one
    // per detail header, never a second beside it.
    expect(header.querySelectorAll('[data-testid="line-state-pill"]')).toHaveLength(1)
    expect(screen.getByTestId('unplug-open')).toBeTruthy()
    expect(screen.getByTestId('embed-snippet')).toBeTruthy()
    expect(screen.getByTestId('embed-snippet-text').textContent).toContain('<iframe')
  })

  it('invites the first line when the board is empty', async () => {
    apiRequestMock.mockResolvedValue([])
    await renderBoard()

    expect(screen.getByTestId('board-empty').textContent).toContain('No lines on the board yet')
    expect(screen.getByText('Plug in a new line')).toBeTruthy()
  })

  it('maps a 429 from the API onto the On hold surface', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(429, 'RATE_LIMIT_ERROR', 'On hold'))
    await renderBoard()

    expect(screen.getByTestId('board-on-hold')).toBeTruthy()
    expect(screen.getByTestId('board-on-hold').textContent).toContain('On hold')
  })

  it('surfaces other API failures in operator language', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(500, 'SERVER_ERROR', 'Something failed on our side. Try again in a moment.'))
    await renderBoard()

    expect(screen.getByTestId('board-error')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Something failed on our side')
  })
})

describe('ChatbotDetailRedirectPage — route compatibility', () => {
  it('redirects the old detail route into the pane selection', async () => {
    // redirect() throws in the mock; catch it and assert the target.
    await expect(
      ChatbotDetailRedirectPage({ params: Promise.resolve({ id: BOT_DRAFT.id }) }),
    ).rejects.toThrow('redirect: /board?line=bot-1')
    expect(redirectMock).toHaveBeenCalledWith('/board?line=bot-1')
  })
})
