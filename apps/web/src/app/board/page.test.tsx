// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { ApiError } from '@/lib/api-errors'

/**
 * WI-007 Task 12: the board renders jack rows from the API payload.
 * The page is a Server Component — its data sources (session + API
 * call) are mocked here so the real fetch→map→render path is exercised.
 */

vi.mock('next/link', () => ({
  default: (props: { href?: string; children?: React.ReactNode } & Record<string, unknown>) => {
    const { href, children, ...rest } = props
    return createElement('a', { href, ...rest }, children)
  },
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

import { apiRequest } from '@/lib/api-client'
import BoardPage from './page'

const apiRequestMock = apiRequest as unknown as import('vitest').Mock

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

beforeEach(() => {
  apiRequestMock.mockReset()
})

afterEach(cleanup)

describe('BoardPage — Your lines', () => {
  it('renders one jack row per chatbot from the API payload, with line states', async () => {
    apiRequestMock.mockResolvedValue([BOT_DRAFT, BOT_LIVE])

    render(await BoardPage())

    // Jack rows carry the bot names as engraved-plate labels.
    expect(screen.getByText('Front Desk')).toBeTruthy()
    expect(screen.getByText('Menu Line')).toBeTruthy()

    // Line-state indicators: draft → unplugged, published → live.
    const draftCard = screen.getByText('Front Desk').closest('[data-testid="jack-card"]')!
    expect(draftCard.getAttribute('data-line-state')).toBe('unplugged')
    const liveCard = screen.getByText('Menu Line').closest('[data-testid="jack-card"]')!
    expect(liveCard.getAttribute('data-line-state')).toBe('live')

    // Each row links to the line's detail panel.
    const links = screen.getAllByTestId('board-line-link')
    expect(links).toHaveLength(2)
    expect(links[0]!.getAttribute('href')).toBe('/board/chatbots/bot-1')
    expect(links[1]!.getAttribute('href')).toBe('/board/chatbots/bot-2')

    // The create/plug control is the primary action into the wizard; its
    // ground is the deep amber step (raw patch-amber fails the 4.5:1
    // ivory-text contrast floor — raw amber stays on the jacks).
    const plug = screen.getByTestId('plug-new-line')
    expect(plug.getAttribute('href')).toBe('/board/wizard')
    expect(plug.className).toContain('bg-patch-amber-deep')
  })

  it('never plays the publish animation on a plain board render', async () => {
    apiRequestMock.mockResolvedValue([BOT_LIVE])

    render(await BoardPage())

    const jack = document.querySelector('[data-testid="jack-body"]') as HTMLElement
    expect(jack.className).toContain('bg-patch-amber')
    expect(jack.className).not.toContain('animate-jack-click')
  })

  it('invites the first line when the board is empty', async () => {
    apiRequestMock.mockResolvedValue([])

    render(await BoardPage())

    expect(screen.getByTestId('board-empty').textContent).toContain('No lines on the board yet')
    expect(screen.getByText('Plug in a new line')).toBeTruthy()
  })

  it('maps a 429 from the API onto the On hold surface', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(429, 'RATE_LIMIT_ERROR', 'On hold'))

    render(await BoardPage())

    expect(screen.getByTestId('board-on-hold')).toBeTruthy()
    expect(screen.getByTestId('board-on-hold').textContent).toContain('On hold')
  })

  it('surfaces other API failures in operator language', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(500, 'SERVER_ERROR', 'Something failed on our side. Try again in a moment.'))

    render(await BoardPage())

    expect(screen.getByTestId('board-error')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Something failed on our side')
  })
})
