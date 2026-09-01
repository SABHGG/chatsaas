// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { JackCard } from './jack-card'

/**
 * WI-007 Task 6: the labeled jack row. Patch Amber may light the jack
 * body only when the line is live (Live Line Rule); every other state
 * stays Slate Ink. The one elevated element is the lit jack
 * (--shadow-live-jack), and the patch-cord click — Motion's spring —
 * plays only when the card was just plugged in at publish. The
 * reduced-motion fallback lives in jack-card-reduced-motion.test.tsx.
 */
describe('JackCard', () => {
  afterEach(cleanup)

  /** Inline motion pose of the jack: the click is transform-driven. */
  function jackPose(container: HTMLElement): string {
    const jack = container.querySelector('[data-testid="jack-body"]') as HTMLElement
    return `${jack.style.transform} ${jack.style.opacity}`
  }

  it('renders the bot name as the engraved-plate label', () => {
    render(<JackCard name="Front Desk" lineState="unplugged" />)
    const name = screen.getByTestId('jack-name')
    expect(name.textContent).toBe('Front Desk')
  })

  it('lights the jack with Patch Amber and the live-jack shadow only when live', () => {
    const live = render(<JackCard name="Front Desk" lineState="live" />)
    const liveJack = live.container.querySelector('[data-testid="jack-body"]')!
    expect(liveJack.className).toContain('bg-patch-amber')
    expect(liveJack.className).toContain('shadow-live-jack')
    live.unmount()

    for (const state of ['unplugged', 'connecting', 'on hold'] as const) {
      const { container, unmount } = render(<JackCard name="Front Desk" lineState={state} />)
      const jack = container.querySelector('[data-testid="jack-body"]')!
      expect(jack.className).not.toContain('patch-amber')
      expect(jack.className).not.toContain('shadow-live-jack')
      expect(jack.className).toContain('bg-slate-ink')
      unmount()
    }
  })

  it('keeps the card flat at rest (Flat-by-Default Rule)', () => {
    const { container } = render(<JackCard name="Front Desk" lineState="live" />)
    const card = container.querySelector('[data-testid="jack-card"]')!
    expect(card.className).not.toContain('shadow')
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
