import { ApiError } from '@/lib/api-errors'
import type { ChatbotListItem, DocumentRecord, Plan } from '@/lib/api-schemas'
import { ChatbotDetailHeader } from './chatbot-detail-header'
import { EmbedSnippet } from './embed-snippet'
import { LineDocuments } from './line-documents'

/**
 * The selected line's detail pane (the Flight-Strip Control Board): the
 * pulled strip's full panel always open beside the rack — state, documents
 * (wired, read, and uploaded through the LineDocuments client island),
 * the plug/unplug controls, and (once live) the iframe generator. The
 * data is fetched server-side by the board page with the Bearer token;
 * the mutations live in client islands (ChatbotDetailHeader,
 * LineDocuments) and ride the BFF proxy.
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

export function LineDetail({ bot, documents, documentsError, plans, embedUrl }: LineDetailProps) {
  return (
    <article aria-label={bot.name}>
      <h1 className="sr-only">{bot.name}</h1>

      <ChatbotDetailHeader chatbotId={bot.id} name={bot.name} status={bot.status} plans={plans} />

      {/* Keyed by line: switching lines remounts the island, so pending
          uploads and dropzone state never leak across lines. */}
      <LineDocuments
        key={bot.id}
        chatbotId={bot.id}
        documents={documents}
        documentsError={
          documentsError
            ? { status: documentsError.status, message: documentsError.message }
            : null
        }
      />

      {embedUrl && (
        <div className="mt-10">
          <EmbedSnippet url={embedUrl} />
        </div>
      )}
    </article>
  )
}
