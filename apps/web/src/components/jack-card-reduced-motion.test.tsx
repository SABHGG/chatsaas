// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { JackCard } from './jack-card'

/**
 * The reduced-motion contract of the ONE authored moment (ADR-007): the
 * patch-cord click must degrade to an opacity-only fade — no transform
 * spring — when the operator's OS prefers reduced motion.
 *
 * This lives in its own file because Motion's `useReducedMotion` reads
 * the media query through a module-level singleton (initialized on the
 * first hook call), and vitest gives each test file a fresh module
 * registry: stubbing `window.matchMedia` here means the singleton is
 * born reduced — exactly the production condition.
 */
describe('JackCard under prefers-reduced-motion', () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('falls back to opacity-only: the just-plugged click never transforms', () => {
    const { container } = render(<JackCard name="Front Desk" lineState="live" justPlugged />)
    const jack = container.querySelector('[data-testid="jack-body"]') as HTMLElement
    // No scale spring — the moment fades in through opacity alone.
    expect(jack.style.transform).toBe('')
    expect(jack.style.opacity).toBe('0')
  })
})
