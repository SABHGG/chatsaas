'use client'

import { buttonVariants } from '@/components/ui/button'
import {
  Dialog as ShadcnDialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ReactNode } from 'react'

/**
 * The board's confirmation dialog: a dimmed overlay over a focused
 * panel — never `window.confirm`, never a browser alert.
 *
 * Built on the shadcn/Radix dialog primitive: Escape, backdrop
 * dismissal, focus handling, and the aria wiring are the primitive's
 * job. The public API (open/onClose/title/children/actions) is the
 * board's own; the testids survive on the primitive's own elements
 * (dialog-overlay on the backdrop, dialog-panel on the content).
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
    <ShadcnDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <DialogContent
        data-testid="dialog-panel"
        showCloseButton={false}
        className="max-w-md sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </ShadcnDialog>
  )
}

/**
 * Shared action-button treatments for dialogs, kept in sync with the
 * shadcn Button variants (cancel = outline, primary = default).
 */
export const DIALOG_CANCEL_CLASS = buttonVariants({ variant: 'outline' })

/** The primary action ground (default variant — the new world's emphasis). */
export const DIALOG_PRIMARY_CLASS = buttonVariants({ variant: 'default' })

/** Alias kept for existing call sites; same emphasis as the primary. */
export const DIALOG_INK_CLASS = buttonVariants({ variant: 'default' })
