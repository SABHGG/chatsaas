'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * The in-world dialog (DC-007-2, DC-007-3): a dimmed panel over the
 * board — never `window.confirm`, never a browser alert. Discipline:
 * Flat-by-Default holds here too. The panel carries no shadow of its
 * own; separation comes from the tonal ink overlay and the hairline
 * border. No colored accents — the panel is ivory, the actions are ink,
 * and amber appears only if the caller marks an action as the primary
 * publish control.
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
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // Focus lands on the panel so Escape and screen readers start here.
    panelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      data-testid="dialog-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-ink/40 p-6"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid="dialog-panel"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-card border border-hairline-slate bg-panel-warm p-6 outline-none"
      >
        <h2 className="font-mono text-sm font-semibold uppercase tracking-plate text-slate-ink">
          {title}
        </h2>
        <div className="mt-3 text-sm leading-relaxed text-slate-ink/80">{children}</div>
        <div className="mt-6 flex items-center justify-end gap-3">{actions}</div>
      </div>
    </div>
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
