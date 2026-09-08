// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'

/**
 * WI-010: the root route `/` is the Spanish marketing landing for guests;
 * an authenticated operator is redirected server-side to /board before
 * anything renders. A session read failure degrades toward the landing —
 * a broken cookie must never 500 the public face of the product.
 */

vi.mock('next/link', () => ({
  default: (props: { href?: string; children?: React.ReactNode } & Record<string, unknown>) => {
    const { href, children, ...rest } = props
    return createElement('a', { href, ...rest }, children)
  },
}))

const redirectMock = vi.fn((url: string) => {
  throw new Error(`redirect: ${url}`)
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

const getSessionMock = vi.fn()

vi.mock('@/lib/auth', () => ({
  getSession: () => getSessionMock(),
}))

import LandingPage from './page'

const SESSION = {
  sub: 'op-1',
  email: 'op@example.com',
  companyId: 'co-1',
  accessClaims: {},
}

beforeEach(() => {
  redirectMock.mockReset()
  getSessionMock.mockReset()
})

afterEach(cleanup)

describe('LandingPage — the root gate', () => {
  it('redirects an authenticated operator to /board before rendering anything', async () => {
    getSessionMock.mockResolvedValue(SESSION)

    await expect(LandingPage()).rejects.toThrow('redirect: /board')
    expect(redirectMock).toHaveBeenCalledWith('/board')
  })

  it('serves the Spanish landing to a guest', async () => {
    getSessionMock.mockResolvedValue(null)
    render(await LandingPage())

    // The hero carries the recorded value prop.
    expect(
      screen.getByRole('heading', { name: /chatbot de ia entrenado con los documentos de tu empresa/i }),
    ).toBeTruthy()
    // The how-it-works strip files three steps, in Spanish.
    expect(screen.getByText('Crea tu chatbot')).toBeTruthy()
    expect(screen.getByText('Sube tus documentos')).toBeTruthy()
    expect(screen.getByText('Comparte la URL o el iframe')).toBeTruthy()
    // FAQ + the honest proof placeholder.
    expect(screen.getByText(/¿Necesito saber de AWS/i)).toBeTruthy()
    expect(screen.getByTestId('landing-proof-placeholder').textContent).toContain(
      'no publicamos logos ni testimonios',
    )
    // The footer closes the page.
    expect(screen.getByText('© 2026 chatSaaS')).toBeTruthy()
  })

  it('degrades a failed session read to the guest landing (never a 500)', async () => {
    getSessionMock.mockRejectedValue(new Error('cookie store unavailable'))

    render(await LandingPage())
    expect(
      screen.getByRole('heading', { name: /chatbot de ia entrenado/i }),
    ).toBeTruthy()
  })

  it('points every primary CTA at /login and marks the page Spanish', async () => {
    getSessionMock.mockResolvedValue(null)
    const { container } = render(await LandingPage())

    // The two CTAs and the header/footer sign-in paths all lead to /login.
    const loginLinks = Array.from(container.querySelectorAll('a')).filter(
      (anchor) => anchor.getAttribute('href') === '/login',
    )
    expect(loginLinks.length).toBeGreaterThanOrEqual(3)

    // Screen readers get the right language for the Spanish copy.
    expect(container.querySelector('[lang="es"]')).toBeTruthy()
  })

  it('keeps pricing qualitative — no numbers, no invented proof', async () => {
    getSessionMock.mockResolvedValue(null)
    render(await LandingPage())

    const text = document.body.textContent ?? ''
    expect(text).toMatch(/límites claros/i)
    expect(text).not.toMatch(/\$\s?\d/)
    expect(text).not.toMatch(/USD \d/)
  })
})
