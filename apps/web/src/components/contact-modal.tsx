'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from './dialog'

/**
 * The prepayment surface: a "Contact us" modal placeholder — deliberately
 * NOT a fake checkout. Plan upgrades and prepaid credit top-ups are
 * arranged with us directly; the modal says exactly that and hands the
 * operator a mailto link. No card fields, no mock payment flow, no
 * invented promise.
 */
export function ContactModal() {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <Button
        type="button"
        data-testid="contact-open"
        onClick={() => setOpen(true)}
      >
        Need more credits? Contact us
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Contact us"
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button asChild>
              <a
                href="mailto:support@chatsaas.app?subject=Prepaid%20credits"
                data-testid="contact-mailto"
              >
                Write to us
              </a>
            </Button>
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
