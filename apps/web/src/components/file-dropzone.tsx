'use client'

import { useCallback, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { uploadDocument, validateUploadFile, type UploadedDocument } from '@/lib/upload'
import type { WizardDocument } from './wizard-store'

/**
 * The document dropzone (WI-007 Task 10): drag-and-drop with a
 * keyboard-accessible file-input fallback (the visually-hidden input
 * keeps native focus and Enter/Space activation). Uploads ride the BFF
 * proxy with XHR progress events, retry exactly once on transient
 * network failure, and surface structured API errors in operator
 * language (429 → "On hold").
 *
 * Instrumentation discipline: the progress fill is Slate Ink — this is
 * wiring work, not the live line, so no Patch Amber here.
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
        className={`flex cursor-pointer flex-col items-center justify-center rounded-card border border-dashed px-6 py-10 text-center transition-colors motion-reduce:transition-none ${
          dragOver ? 'border-slate-ink bg-well-warm' : 'border-hairline-slate bg-panel-warm'
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
            <p data-testid="dropzone-uploading" className="font-mono text-xs uppercase tracking-plate">
              Uploading · {progress}%
            </p>
            {/* The wiring meter: flat well, ink fill. */}
            <div
              data-testid="dropzone-progress"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-3 h-2 w-56 overflow-hidden rounded-full bg-well-warm"
            >
              <span className="block h-full bg-slate-ink" style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-ink/70">
            Drop a file here, or{' '}
            <span className="font-medium text-slate-ink underline underline-offset-4">
              browse from this device
            </span>
            .
          </p>
        )}
        <p id={`${inputId}-hint`} className="mt-2 font-mono text-xs uppercase tracking-plate text-slate-ink/60">
          PDF · DOCX · TXT · MD · up to 10 MB
        </p>
      </div>

      {phase === 'error' && error && (
        <div className="mt-3 flex items-start justify-between gap-4">
          <p role="alert" data-testid="dropzone-error" className="text-sm text-slate-ink">
            {error}
          </p>
          <button
            type="button"
            data-testid="dropzone-dismiss"
            onClick={() => {
              setError(null)
              setPhase('idle')
            }}
            className="shrink-0 rounded-plate border border-hairline-slate bg-panel-warm px-3 py-1.5 font-mono text-xs uppercase tracking-plate hover:bg-well-warm"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
