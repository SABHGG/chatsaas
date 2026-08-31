// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { JackCard } from './jack-card'

/**
 * WI-007 Task 6: the labeled jack row. Patch Amber may light the jack
 * body only when the line is live (Live Line Rule); every other state
 * stays Slate Ink. The one elevated element is the lit jack
 * (--shadow-live-jack), and the patch-cord click plays only when the
 * card was just plugged in at publish.
 */
describe('JackCard', () => {
  afterEach(cleanup)

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

  it('plays the patch-cord click only on the just-plugged live card', () => {
    const justPlugged = render(<JackCard name="Front Desk" lineState="live" justPlugged />)
    expect(justPlugged.container.querySelector('[data-testid="jack-body"]')!.className).toContain(
      'animate-jack-click',
    )
    justPlugged.unmount()

    // Resting live cards never re-animate (motion is for the publish moment).
    const resting = render(<JackCard name="Front Desk" lineState="live" />)
    expect(resting.container.querySelector('[data-testid="jack-body"]')!.className).not.toContain(
      'animate-jack-click',
    )
    resting.unmount()

    // And the click only exists for a live jack.
    const wrongState = render(<JackCard name="Front Desk" lineState="unplugged" justPlugged />)
    expect(wrongState.container.querySelector('[data-testid="jack-body"]')!.className).not.toContain(
      'animate-jack-click',
    )
  })

  it('exposes the line state to assistive tech', () => {
    render(<JackCard name="Front Desk" lineState="on hold" />)
    const card = screen.getByTestId('jack-card')
    expect(card.getAttribute('data-line-state')).toBe('on hold')
    expect(screen.getByText('On hold')).toBeTruthy()
  })
})
