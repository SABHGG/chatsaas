'use client'

import { Dialog as BaseDialog } from '@base-ui-components/react/dialog'
import type { ReactNode } from 'react'

/**
 * The in-world dialog (DC-007-2, DC-007-3): a dimmed panel over the
 * board — never `window.confirm`, never a browser alert. Discipline:
 * Flat-by-Default holds here too. The panel carries no shadow of its
 * own; separation comes from the tonal ink overlay and the hairline
 * border. No colored accents — the panel is ivory, the actions are ink,
 * and amber appears only if the caller marks an action as the primary
 * publish control.
 *
 * Built on Base UI's headless Dialog: Escape, backdrop dismissal, focus
 * handling, and the aria wiring are the primitive's job now — the
 * hand-rolled keyboard listener is gone. The public API (open/onClose/
 * title/children/actions) and the world styling are unchanged; the testids
 * survive on the primitive's own elements.
 */
export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Callers supply their own action row (buttons). */
  actions: ReactNode
}

export function Dialog({ open, onClose, title, children, actions }: DialogProps) {
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop
          data-testid="dialog-overlay"
          className="fixed inset-0 z-50 bg-slate-ink/40"
        />
        <BaseDialog.Popup
          data-testid="dialog-panel"
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_3rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-hairline-slate bg-panel-warm p-6 outline-none"
        >
          <BaseDialog.Title className="font-mono text-sm font-semibold uppercase tracking-plate text-slate-ink">
            {title}
          </BaseDialog.Title>
          <div className="mt-3 text-sm leading-relaxed text-slate-ink/80">{children}</div>
          <div className="mt-6 flex items-center justify-end gap-3">{actions}</div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

/** Shared action-button treatments for dialogs (ink first, amber rationed). */
export const DIALOG_CANCEL_CLASS =
  'rounded-plate border border-hairline-slate bg-panel-warm px-4 py-2 font-mono text-xs font-medium uppercase tracking-plate text-slate-ink hover:bg-well-warm'

/** Primary action ground uses the deep amber step: raw patch-amber fails
 *  the 4.5:1 ivory-text contrast floor (raw amber stays surface-only —
 *  jack bodies, pill dots, live rings). */
export const DIALOG_PRIMARY_CLASS =
  'rounded-plug bg-patch-amber-deep px-4 py-2 font-mono text-xs font-semibold uppercase tracking-plate text-operators-ivory hover:bg-patch-amber-deep/90'

export const DIALOG_INK_CLASS =
  'rounded-plug bg-slate-ink px-4 py-2 font-mono text-xs font-semibold uppercase tracking-plate text-operators-ivory hover:bg-slate-ink/90'
