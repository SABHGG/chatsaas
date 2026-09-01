// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

/**
 * WI-007 Task 11: wizard step guards and the DC-007-2 publish gate.
 *
 * Guard deviation (recorded): the draft lives in localStorage, which the
 * server cannot read, so the yml's "SSR redirect" is a post-hydration
 * client redirect — these tests drive it through the real pages with
 * `next/navigation` mocked.
 */

const { pushSpy, replaceSpy } = vi.hoisted(() => ({ pushSpy: vi.fn(), replaceSpy: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, replace: replaceSpy, refresh: vi.fn() }),
  usePathname: () => '/board/wizard',
}))

vi.mock('@/lib/bff-request', () => ({
  proxyRequest: vi.fn(),
}))

import { proxyRequest } from '@/lib/bff-request'
import { OperatorProvider } from '@/components/operator-context'
import WizardNamePage from './page'
import WizardDocumentsPage from './documents/page'
import WizardReviewPage from './review/page'
import WizardPublishPage from './publish/page'

const proxyMock = proxyRequest as unknown as import('vitest').Mock

const OPERATOR = 'op-1'
const DRAFT_KEY = 'chatsaas:draft:op-1:new'
const CHATBOT_REF = 'chatsaas:wizard-ref:op-1:chatbot-id'
const PLAN_REF = 'chatsaas:wizard-ref:op-1:plan-id'

// Reconciled backend wire shapes (apps/functions — Batch D Task 0).
const PLAN = {
  id: 'plan-starter',
  name: 'Starter',
  description: 'For a single counter line',
  price: 19.0,
  interval: 'monthly',
}

const DOC_UPLOADED = {
  id: 'doc-1',
  chatbotId: 'bot-1',
  companyId: 'company-1',
  ownerSub: 'op-1',
  filename: 'price-list.pdf',
  mimeType: 'application/pdf',
  byteCount: 2048,
  status: 'uploaded',
  s3Key: 'company-1/bot-1/doc-1/price-list.pdf',
  metadata: {},
  createdAt: '2026-08-31T10:00:00Z',
  updatedAt: '2026-08-31T10:00:00Z',
}

const PUBLISH_RESPONSE = {
  status: 'published',
  url: 'https://chat.chatsaas.local/bot-1',
  iframe_src: '<iframe src="https://chat.chatsaas.local/bot-1"></iframe>',
  expires_at: null,
}

const BOT_LIKE = {
  id: 'bot-1',
  name: 'Front Desk',
  status: 'draft',
  document_count: 0,
  created_at: '2026-08-31T10:00:00Z',
  updated_at: '2026-08-31T10:00:00Z',
  published_at: null,
}

function seedDraft(name: string, documents: unknown[] = [], step = 'name') {
  window.localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ state: { step, name, documents }, version: 1 }),
  )
}

function renderStep(ui: React.ReactElement) {
  return render(<OperatorProvider operatorId={OPERATOR}>{ui}</OperatorProvider>)
}

function wireHappyDraft() {
  seedDraft('Front Desk', [], 'publish')
  window.sessionStorage.setItem(CHATBOT_REF, 'bot-1')
  window.sessionStorage.setItem(PLAN_REF, 'plan-starter')
  proxyMock.mockImplementation(async (path: string) => {
    if (path === '/plans/available') return [PLAN]
    if (path === '/chatbots/bot-1/documents') return { documents: [DOC_UPLOADED] } // 0 ready
    if (path === '/chatbots/bot-1/publish') return PUBLISH_RESPONSE
    throw new Error(`unexpected proxy call: ${path}`)
  })
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  proxyMock.mockReset()
  pushSpy.mockClear()
  replaceSpy.mockClear()
})

afterEach(cleanup)

describe('wizard step guards (post-hydration redirects)', () => {
  it('sends the operator back to step 1 when documents is reached without a name', async () => {
    renderStep(<WizardDocumentsPage />)

    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/board/wizard'))
    // The guard fires before any wiring work: nothing hits the proxy.
    expect(proxyMock).not.toHaveBeenCalled()
  })

  it('sends the operator back to review when publish is reached without a plan', async () => {
    seedDraft('Front Desk', [], 'publish')
    window.sessionStorage.setItem(CHATBOT_REF, 'bot-1')
    // No plan ref.

    renderStep(<WizardPublishPage />)

    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/board/wizard/review'))
    expect(proxyMock).not.toHaveBeenCalled()
  })

  it('sends the operator back to step 1 when review is reached without a name', async () => {
    // The plans read is unconditional on this step; stub it so only the
    // guard behavior is under test.
    proxyMock.mockResolvedValue([PLAN])

    renderStep(<WizardReviewPage />)

    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/board/wizard'))
    // The guard fires before any wiring work: no documents fetch.
    expect(proxyMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/documents'),
      expect.anything(),
    )
  })
})

describe('step 1 — name the line', () => {  it('mints the draft chatbot once and advances to documents', async () => {
    proxyMock.mockResolvedValue({ ...BOT_LIKE })

    renderStep(<WizardNamePage />)

    fireEvent.change(screen.getByTestId('wizard-name-input'), { target: { value: 'Front Desk' } })
    fireEvent.click(screen.getByTestId('wizard-continue'))

    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/board/wizard/documents'))
    expect(proxyMock).toHaveBeenCalledWith(
      '/chatbots',
      expect.objectContaining({ method: 'POST', body: { name: 'Front Desk', description: null } }),
    )
    expect(window.sessionStorage.getItem(CHATBOT_REF)).toBe('bot-1')
  })
})

describe('DC-007-2 — publishing with 0 ready documents is gated behind the dialog', () => {
  /** Wait until the publish page has resolved readiness (no click races). */
  async function waitForReadiness() {
    await waitFor(() => {
      const docs = screen.getByTestId('publish-summary-docs')
      expect(docs.textContent).not.toContain('checking')
    })
  }

  it('shows the in-world confirmation first; cancel publishes nothing', async () => {
    wireHappyDraft()

    renderStep(<WizardPublishPage />)
    const plug = await screen.findByTestId('wizard-plug')
    await waitFor(() => expect((plug as HTMLButtonElement).disabled).toBe(false))
    await waitForReadiness()

    fireEvent.click(plug)

    // The dialog is in-world: role=dialog, never window.confirm.
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Publish without ready documents?')
    expect(proxyMock).not.toHaveBeenCalledWith('/chatbots/bot-1/publish', expect.anything())

    fireEvent.click(screen.getByText('Not yet'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(proxyMock).not.toHaveBeenCalledWith('/chatbots/bot-1/publish', expect.anything())
  })

  it('publishes through the BFF proxy on confirm, plays the plug moment, and lands on the detail', async () => {
    wireHappyDraft()

    renderStep(<WizardPublishPage />)
    const plug = await screen.findByTestId('wizard-plug')
    await waitFor(() => expect((plug as HTMLButtonElement).disabled).toBe(false))
    await waitForReadiness()

    fireEvent.click(plug)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByTestId('publish-confirm'))

    // The publish mutation rides the BFF proxy with the picked plan.
    await waitFor(() =>
      expect(proxyMock).toHaveBeenCalledWith(
        '/chatbots/bot-1/publish',
        expect.objectContaining({ method: 'POST', body: { plan_id: 'plan-starter' } }),
      ),
    )

    // The plug moment: the lit jack plays the ONE patch-cord click —
    // Motion's spring, remounted from scale 0.6 on the plugged screen.
    await waitFor(() => {
      const jack = document.querySelector('[data-testid="jack-body"]') as HTMLElement
      expect(jack.className).toContain('bg-patch-amber')
      expect(jack.style.transform).toContain('scale')
    })

    // The operator lands on the detail page with the line visibly live.
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/board/chatbots/bot-1'), {
      timeout: 3000,
    })

    // The draft is spent: no name, no server refs left behind.
    const spent = JSON.parse(window.localStorage.getItem(DRAFT_KEY)!)
    expect(spent.state.name).toBe('')
    expect(window.sessionStorage.getItem(CHATBOT_REF)).toBeNull()
    expect(window.sessionStorage.getItem(PLAN_REF)).toBeNull()
  })

  it('publishes directly when at least one document is ready', async () => {
    wireHappyDraft()
    proxyMock.mockImplementation(async (path: string) => {
      if (path === '/plans/available') return [PLAN]
      if (path === '/chatbots/bot-1/documents')
        return { documents: [{ ...DOC_UPLOADED, status: 'ready' }] }
      if (path === '/chatbots/bot-1/publish') return PUBLISH_RESPONSE
      throw new Error(`unexpected proxy call: ${path}`)
    })

    renderStep(<WizardPublishPage />)
    const plug = await screen.findByTestId('wizard-plug')
    await waitFor(() => expect((plug as HTMLButtonElement).disabled).toBe(false))
    await waitForReadiness()

    fireEvent.click(plug)

    await waitFor(() =>
      expect(proxyMock).toHaveBeenCalledWith('/chatbots/bot-1/publish', expect.anything()),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
