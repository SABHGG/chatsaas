'use client'

import { useCallback, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { uploadDocument, validateUploadFile, type UploadedDocument } from '@/lib/upload'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { WizardDocument } from './wizard-store'

/**
 * The document dropzone: drag-and-drop with a keyboard-accessible
 * file-input fallback (the visually-hidden input keeps native focus and
 * Enter/Space activation). Uploads ride the BFF proxy with XHR progress
 * events, retry exactly once on transient network failure, and surface
 * structured API errors in operator language (429 → "On hold").
 *
 * Instrumentation discipline: the progress fill is achromatic ink —
 * this is wiring work, not the live line, so no stamp red here. The
 * tray is paper with a solid hairline; a dragged-over tray opens
 * (accent ground, ink edge) instead of changing hue.
 */
export interface FileDropzoneProps {
  /** The line the documents are being wired into. */
  chatbotId: string
  /** Called with each successfully uploaded document. */
  onUploaded: (document: WizardDocument) => void
}

type DropzonePhase = 'idle' | 'uploading' | 'error'

function toWizardDocument(doc: UploadedDocument): WizardDocument {
  // lib/upload.ts already normalizes the API response into this exact
  // shape (camelCase, display fields merged from the picked File).
  return {
    id: doc.id,
    fileName: doc.fileName,
    fileSize: doc.fileSize,
    contentType: doc.contentType,
    status: doc.status,
  }
}

export function FileDropzone({ chatbotId, onUploaded }: FileDropzoneProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<DropzonePhase>('idle')
  const [progress, setProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(
    async (file: File) => {
      const rejection = validateUploadFile(file)
      if (rejection) {
        setError(rejection)
        setPhase('error')
        return
      }

      setPhase('uploading')
      setError(null)
      setProgress(0)

      try {
        const uploaded = await uploadDocument(
          { file, chatbotId, onProgress: setProgress },
          () => new XMLHttpRequest(),
        )
        onUploaded(toWizardDocument(uploaded))
        setPhase('idle')
        setProgress(0)
      } catch (err) {
        // uploadDocument already mapped the failure to operator language.
        setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
        setPhase('error')
      }
    },
    [chatbotId, onUploaded],
  )

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDragOver(false)
    const file = event.dataTransfer.files[0]
    if (file) void upload(file)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // The visible region activates the hidden input for keyboard operators.
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      inputRef.current?.click()
    }
  }

  return (
    <div data-testid="file-dropzone">
      <div
        role="button"
        tabIndex={0}
        aria-label={`Add documents for ${chatbotId}`}
        aria-describedby={`${inputId}-hint`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onKeyDown={onKeyDown}
        onClick={(event) => {
          // The hidden input sits inside this region: its own bubbled
          // click (from .click()) must not re-trigger the picker.
          if ((event.target as HTMLElement).tagName === 'INPUT') return
          inputRef.current?.click()
        }}
        className={`flex cursor-pointer flex-col items-center justify-center border px-6 py-10 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none ${
          dragOver ? 'border-foreground bg-accent' : 'border-border bg-card'
        }`}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void upload(file)
          }}
        />
        {phase === 'uploading' ? (
          <>
            <p data-testid="dropzone-uploading" className="readout-mono text-sm text-muted-foreground">
              Uploading · {progress}%
            </p>
            {/* The wiring meter: paper-dim track, ink fill. */}
            <Progress
              data-testid="dropzone-progress"
              value={progress}
              className="mt-3 h-2 w-56"
              indicatorClassName="bg-foreground"
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Drop a file in the tray, or{' '}
            <span className="font-medium text-foreground underline underline-offset-4">
              browse from this device
            </span>
            .
          </p>
        )}
        <p id={`${inputId}-hint`} className="readout-mono mt-2 text-xs text-muted-foreground/80">
          PDF · DOCX · TXT · MD · up to 10 MB
        </p>
      </div>

      {phase === 'error' && error && (
        <div className="mt-3 flex items-start justify-between gap-4">
          <p role="alert" data-testid="dropzone-error" className="text-sm text-foreground">
            {error}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="dropzone-dismiss"
            onClick={() => {
              setError(null)
              setPhase('idle')
            }}
            className="shrink-0"
          >
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}
