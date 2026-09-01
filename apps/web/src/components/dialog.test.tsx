// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DIALOG_CANCEL_CLASS, DIALOG_PRIMARY_CLASS, Dialog } from './dialog'

/**
 * The in-world dialog on Base UI's headless primitive (DC-007-2/-3):
 * same public API, world styling, and testids as the hand-rolled version
 * — Escape, backdrop dismissal, focus, and the aria wiring now come from
 * the primitive, not from our own document listeners.
 */
describe('Dialog (Base UI primitive)', () => {
  afterEach(cleanup)

  it('renders its content in-world and closes on Escape via Base UI', async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Dialog
        open
        onClose={onClose}
        title="Unplug this line"
        actions={
          <>
            <button type="button" className={DIALOG_CANCEL_CLASS}>
              Not now
            </button>
            <button type="button" className={DIALOG_PRIMARY_CLASS}>
              Unplug
            </button>
          </>
        }
      >
        <p>Visitors will stop reaching this chatbot the moment the line comes off the board.</p>
      </Dialog>,
    )

    // In-world panel: a modal dialog named by its Base UI Title (the
    // primitive wires aria-labelledby; modality is its focus manager +
    // inert background), with both testids, title, body, and actions.
    const dialog = screen.getByRole('dialog', { name: 'Unplug this line' })
    expect(screen.getByTestId('dialog-panel')).toBeTruthy()
    expect(screen.getByTestId('dialog-overlay')).toBeTruthy()
    expect(dialog.textContent).toContain('Visitors will stop reaching this chatbot')
    expect(dialog.textContent).toContain('Unplug')

    // Escape (bubbles from the panel to the document) routes to onClose.
    fireEvent.keyDown(screen.getByTestId('dialog-panel'), { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))

    // And the controlled close unmounts the portal entirely — after the
    // primitive's exit-transition bookkeeping has run its course.
    rerender(
      <Dialog open={false} onClose={onClose} title="Unplug this line" actions={null}>
        <p>—</p>
      </Dialog>,
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('stays out of the DOM while closed (never window.confirm, never a stub)', () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Publish without ready documents?" actions={null}>
        <p>—</p>
      </Dialog>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByTestId('dialog-overlay')).toBeNull()
  })
})
