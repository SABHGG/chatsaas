'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DocumentRecord } from '@/lib/api-schemas'
import { Badge } from '@/components/ui/badge'
import { FileDropzone } from './file-dropzone'
import type { WizardDocument } from './wizard-store'

/**
 * The Documents section of the line detail pane: the wired-in documents
 * with their ingest status, plus the dropzone that wires in more — in
 * both draft and published states (the backend's upload endpoint has no
 * published gate).
 *
 * Client island: the pane's data is fetched server-side by the board
 * page (LineDetail renders this island with that data as props), so
 * every update rides the board's established refresh path —
 * `router.refresh()` re-runs the server component, which re-reads the
 * document list. Two things drive it:
 *
 * - an upload success refreshes immediately (the freshly wired document
 *   is also held in local state until the server list confirms it, so
 *   the row never blinks away);
 * - while any document sits in `uploaded`/`processing`, the pane polls
 *   on the 5 s cadence until ingest settles.
 */

/** Poll cadence while ingest is in flight (5 s read-back). */
const INGEST_POLL_MS = 5000

const IN_FLIGHT_STATUSES = new Set(['uploaded', 'processing'])

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  uploaded: 'Uploaded',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
}

function documentStatusLabel(status: string): string {
  return DOCUMENT_STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1)
}

/**
 * Serializable read-failure shape. ApiError instances do not survive
 * the server → client props boundary reliably, so LineDetail flattens
 * the error to the two fields the section renders.
 */
export interface DocumentReadError {
  status: number
  message: string
}

export interface LineDocumentsProps {
  chatbotId: string
  documents: DocumentRecord[] | null
  documentsError: DocumentReadError | null
}

/**
 * Ingest status badge: quiet treatments only — motion is reserved for
 * the ONE chase-light (a connecting line), so in-flight documents sit
 * still and let the mono state word speak.
 */
function DocumentStatusPill({ status }: { status: string }) {
  const isSettled = status === 'ready' || status === 'failed'
  return (
    <Badge
      data-testid="detail-document-status"
      data-status={status}
      variant={isSettled ? 'secondary' : 'outline'}
      className="shrink-0"
    >
      {documentStatusLabel(status)}
    </Badge>
  )
}

/** The dropzone's upload confirmation reshaped as a server document row. */
function toPendingRecord(document: WizardDocument, chatbotId: string): DocumentRecord {
  return {
    id: document.id,
    chatbotId,
    filename: document.fileName,
    mimeType: document.contentType,
    byteCount: document.fileSize,
    status: document.status,
    createdAt: '',
    updatedAt: '',
  }
}

export function LineDocuments({ chatbotId, documents, documentsError }: LineDocumentsProps) {
  const router = useRouter()
  // Uploads confirmed by the API but not yet seen in the server list.
  // LineDetail keys this island by chatbot id, so a line switch starts
  // with clean pending state.
  const [justWired, setJustWired] = useState<DocumentRecord[]>([])

  const serverDocuments = documents ?? []
  const documentList = [
    ...serverDocuments,
    ...justWired.filter((doc) => !serverDocuments.some((server) => server.id === doc.id)),
  ]
  const readyCount = documentList.filter((document) => document.status === 'ready').length
  const ingesting = documentList.some((document) => IN_FLIGHT_STATUSES.has(document.status))

  // Poll while ingest is in flight. The server list arrives through the
  // board's refresh path; a settled list (all ready/failed) stops the
  // poll, and a read error (e.g. the 429 hold) silences it.
  useEffect(() => {
    if (documentsError || !ingesting) return
    const timer = setInterval(() => router.refresh(), INGEST_POLL_MS)
    return () => clearInterval(timer)
  }, [documentsError, ingesting, router])

  const onUploaded = (document: WizardDocument) => {
    setJustWired((previous) => [
      ...previous.filter((doc) => doc.id !== document.id),
      toPendingRecord(document, chatbotId),
    ])
    router.refresh()
  }

  return (
    <section className="mt-10" aria-label="Documents">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="label-mono text-foreground">Documents</h2>
        {!documentsError && documentList.length > 0 && (
          <p
            data-testid="detail-readiness"
            className="readout-mono text-xs text-muted-foreground"
          >
            {readyCount} of {documentList.length} documents ready
          </p>
        )}
      </div>

      {documentsError ? (
        documentsError.status === 429 ? (
          <p data-testid="documents-on-hold" className="mt-3 text-sm text-muted-foreground">
            On hold — the board is holding document reads right now.
          </p>
        ) : (
          <p role="alert" className="mt-3 text-sm text-muted-foreground">
            {documentsError.message}
          </p>
        )
      ) : (
        <>
          {documentList.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {documentList.map((document) => (
                <li
                  key={document.id}
                  data-testid="detail-document-row"
                  className="flex items-center gap-4 border border-border bg-card px-4 py-3 text-card-foreground"
                >
                  <span className="min-w-0 truncate text-sm">
                    {document.filename}
                  </span>
                  <span className="readout-mono ml-auto shrink-0 text-xs text-muted-foreground">
                    {Math.max(1, Math.round(document.byteCount / 1024))} KB
                  </span>
                  <DocumentStatusPill status={document.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              No documents wired in yet. The line answers from what you drop in below.
            </p>
          )}

          {/* The upload affordance: available on draft and live lines —
              a document that failed to process is recovered by wiring
              the file in again (there is no reprocess endpoint). */}
          <div className="mt-4">
            <FileDropzone chatbotId={chatbotId} onUploaded={onUploaded} />
          </div>
        </>
      )}
    </section>
  )
}
