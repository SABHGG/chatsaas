// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LINE_STATE_LABELS, LINE_STATES, LineStatePill } from './line-state-pill'

/**
 * WI-007 Task 6: the line vocabulary is binding — the pill must render
 * exactly Unplugged / Connecting / Live / On hold, and Patch Amber may
 * appear only on the live state (Live Line Rule).
 */
describe('LineStatePill', () => {
  afterEach(cleanup)

  it('declares the exact line-vocabulary label strings', () => {
    expect(LINE_STATE_LABELS.unplugged).toBe('Unplugged')
    expect(LINE_STATE_LABELS.connecting).toBe('Connecting')
    expect(LINE_STATE_LABELS.live).toBe('Live')
    expect(LINE_STATE_LABELS['on hold']).toBe('On hold')
  })

  it('renders every state with its exact label', () => {
    for (const state of LINE_STATES) {
      const { unmount } = render(<LineStatePill state={state} />)
      const pill = screen.getByTestId('line-state-pill')
      expect(pill.textContent).toBe(LINE_STATE_LABELS[state])
      expect(pill.getAttribute('data-line-state')).toBe(state)
      unmount()
    }
  })

  it('carries Patch Amber only on the live state (Live Line Rule)', () => {
    const live = render(<LineStatePill state="live" />)
    expect(live.container.firstElementChild?.className).toContain('border-patch-amber')
    live.unmount()

    for (const state of ['unplugged', 'connecting', 'on hold'] as const) {
      const { container, unmount } = render(<LineStatePill state={state} />)
      expect(container.firstElementChild?.className).not.toContain('patch-amber')
      unmount()
    }
  })
})
