// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { JackCard } from './jack-card'

/**
 * The strip record header. The red LIVE stamp may appear only when the
 * line is live; every other state stays a quiet form (dash, blank). The
 * stamp press — Motion's spring — plays only when the card was just
 * plugged in at publish. The reduced-motion fallback lives in
 * jack-card-reduced-motion.test.tsx.
 */
describe('JackCard', () => {
  afterEach(cleanup)

  /** Inline motion pose of the jack: the click is transform-driven. */
  function jackPose(container: HTMLElement): string {
    const jack = container.querySelector('[data-testid="jack-body"]') as HTMLElement
    return `${jack.style.transform} ${jack.style.opacity}`
  }

  it('renders the bot name as the line label', () => {
    render(<JackCard name="Front Desk" lineState="unplugged" />)
    const name = screen.getByTestId('jack-name')
    expect(name.textContent).toBe('Front Desk')
  })

  it('shows the red stamp only when live', () => {
    const live = render(<JackCard name="Front Desk" lineState="live" />)
    const liveJack = live.container.querySelector('[data-testid="jack-body"]')!
    expect(liveJack.classList.contains('bg-stamp')).toBe(true)
    live.unmount()

    for (const state of ['unplugged', 'connecting', 'on hold'] as const) {
      const { container, unmount } = render(<JackCard name="Front Desk" lineState={state} />)
      const jack = container.querySelector('[data-testid="jack-body"]')!
      expect(jack.classList.contains('bg-stamp')).toBe(false)
      unmount()
    }
  })

  it('keeps the emphasis on the jack, not the card', () => {
    const { container } = render(<JackCard name="Front Desk" lineState="live" />)
    const card = container.querySelector('[data-testid="jack-card"]')!
    expect(card.classList.contains('bg-primary')).toBe(false)
  })

  it('plays the patch-cord spring click only on the just-plugged live card', () => {
    // The click rides Motion: the remounted jack springs in from
    // scale 0.6 (inline transform) — no CSS keyframe class anymore.
    const justPlugged = render(<JackCard name="Front Desk" lineState="live" justPlugged />)
    expect(jackPose(justPlugged.container)).toContain('scale')
    justPlugged.unmount()

    // Resting live cards never animate (motion is for the publish moment).
    const resting = render(<JackCard name="Front Desk" lineState="live" />)
    expect(jackPose(resting.container)).not.toContain('scale')
    resting.unmount()

    // And the click only exists for a live jack.
    const wrongState = render(<JackCard name="Front Desk" lineState="unplugged" justPlugged />)
    expect(jackPose(wrongState.container)).not.toContain('scale')
  })

  it('exposes the line state to assistive tech', () => {
    render(<JackCard name="Front Desk" lineState="on hold" />)
    const card = screen.getByTestId('jack-card')
    expect(card.getAttribute('data-line-state')).toBe('on hold')
    expect(screen.getByText('On hold')).toBeTruthy()
  })
})
