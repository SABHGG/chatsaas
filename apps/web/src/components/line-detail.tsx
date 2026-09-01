import { ApiError } from '@/lib/api-errors'
import type { ChatbotListItem, DocumentRecord, Plan } from '@/lib/api-schemas'
import { ChatbotDetailHeader } from './chatbot-detail-header'
import { EmbedSnippet } from './embed-snippet'

/**
 * The selected line's detail pane (locked direction "The Index Rail"):
 * the line's full panel always open beside the index — state, documents
 * readiness, the plug/unplug controls, and (once live) the iframe
 * generator. The data is fetched server-side by the board page with the
 * Bearer token; the mutations live in the client island
 * (ChatbotDetailHeader) and ride the BFF proxy.
 */
export interface LineDetailProps {
  bot: ChatbotListItem
  documents: DocumentRecord[] | null
  documentsError: ApiError | null
  /** Available plans for the plug dialog; needed only when not live. */
  plans: Plan[] | null
  /** The public URL when the line is live; the embed generator's input. */
  embedUrl: string | null
}

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  uploaded: 'Uploaded',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
}

function documentStatusLabel(status: string): string {
  return DOCUMENT_STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1)
}

export function LineDetail({ bot, documents, documentsError, plans, embedUrl }: LineDetailProps) {
  const documentList = documents ?? []
  const readyCount = documentList.filter((document) => document.status === 'ready').length

  return (
    <article aria-label={bot.name}>
      <h1 className="sr-only">{bot.name}</h1>

      <ChatbotDetailHeader chatbotId={bot.id} name={bot.name} status={bot.status} plans={plans} />

      <section className="mt-10" aria-label="Documents">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-mono text-xs uppercase tracking-plate text-slate-ink">Documents</h2>
          {!documentsError && documentList.length > 0 && (
            <p
              data-testid="detail-readiness"
              className="font-mono text-xs tabular-nums text-slate-ink/70"
            >
              {readyCount} of {documentList.length} documents ready
            </p>
          )}
        </div>

        {documentsError ? (
          documentsError.status === 429 ? (
            <p data-testid="documents-on-hold" className="mt-3 text-sm text-slate-ink/70">
              On hold — the board is holding document reads right now.
            </p>
          ) : (
            <p role="alert" className="mt-3 text-sm text-slate-ink/70">
              {documentsError.message}
            </p>
          )
        ) : documentList.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {documentList.map((document) => (
              <li
                key={document.id}
                data-testid="detail-document-row"
                className="flex items-center gap-4 rounded-plate border border-hairline-slate bg-panel-warm px-4 py-3"
              >
                <span className="min-w-0 truncate font-mono text-sm text-slate-ink">
                  {document.filename}
                </span>
                <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-slate-ink/70">
                  {Math.max(1, Math.round(document.byteCount / 1024))} KB
                </span>
                <span className="shrink-0 font-mono text-xs uppercase tracking-plate text-slate-ink/70">
                  {documentStatusLabel(document.status)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-slate-ink/70">
            No documents wired in yet. Upload them from the wizard&rsquo;s Documents step.
          </p>
        )}
      </section>

      {embedUrl && (
        <div className="mt-10">
          <EmbedSnippet url={embedUrl} />
        </div>
      )}
    </article>
  )
}
