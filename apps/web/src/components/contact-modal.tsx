'use client'

import { useState } from 'react'
import { DIALOG_CANCEL_CLASS, DIALOG_INK_CLASS, Dialog } from './dialog'

/**
 * The prepayment surface (DC-007-3): a "Contact us" modal placeholder —
 * deliberately NOT a fake checkout. Plan upgrades and prepaid credit
 * top-ups are arranged with us directly; the modal says exactly that
 * and hands the operator a mailto link. No card fields, no mock payment
 * flow, no invented promise.
 */
export function ContactModal() {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        type="button"
        data-testid="contact-open"
        onClick={() => setOpen(true)}
        className="rounded-plug bg-slate-ink px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-plate text-operators-ivory hover:bg-slate-ink/90"
      >
        Need more credits? Contact us
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Contact us"
        actions={
          <>
            <button type="button" onClick={() => setOpen(false)} className={DIALOG_CANCEL_CLASS}>
              Close
            </button>
            <a
              href="mailto:support@chatsaas.app?subject=Prepaid%20credits"
              data-testid="contact-mailto"
              className={DIALOG_INK_CLASS}
            >
              Write to us
            </a>
          </>
        }
      >
        <p>
          Prepaid credits and plan changes are arranged with us directly — no card forms on the
          board. Write to <span className="font-mono">support@chatsaas.app</span> and we&rsquo;ll
          top your plan up the same day.
        </p>
      </Dialog>
    </div>
  )
}
