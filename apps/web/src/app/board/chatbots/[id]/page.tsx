import { notFound } from 'next/navigation'
import { asApiError, ApiError } from '@/lib/api-errors'
import { getAccessToken, requireSession } from '@/lib/auth'
import {
  chatbotListSchema,
  creditBalanceSchema,
  documentListSchema,
  planListSchema,
  publishedListSchema,
  type DocumentRecord,
  type Plan,
} from '@/lib/api-schemas'
import { apiRequest } from '@/lib/api-client'
import { ChatbotDetailHeader } from '@/components/chatbot-detail-header'
import { EmbedSnippet } from '@/components/embed-snippet'
import { UsageMeter } from '@/components/usage-meter'

/**
 * Chatbot detail (WI-007 Task 13): the line's own panel — status, the
 * document list, the usage meter, the plug/unplug controls, and (once
 * live) the iframe generator. Everything the API contract offers is
 * fetched server-side with the Bearer token; the mutations live in the
 * client island and ride the BFF proxy.
 *
 * Contract note: the API defines no single-chatbot GET, so the line is
 * resolved from the company list (`GET /api/chatbots`); an unknown id is
 * a 404. The public URL for the embed comes from the published list.
 */
export default async function ChatbotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireSession()
  const accessToken = await getAccessToken()

  // The line itself.
  let bot = null
  try {
    const bots = await apiRequest('/chatbots', { dataSchema: chatbotListSchema, accessToken })
    bot = bots.find((candidate) => candidate.id === id) ?? null
  } catch {
    bot = null
  }
  if (!bot) notFound()

  // Documents, meter, plug plans, and (when live) the embed URL.
  let documents: DocumentRecord[] | null = null
  let documentsError: ApiError | null = null
  try {
    const list = await apiRequest(`/chatbots/${encodeURIComponent(id)}/documents`, {
      dataSchema: documentListSchema,
      accessToken,
    })
    documents = list.documents
  } catch (err) {
    documentsError = asApiError(err)
  }

  let balance: number | null = null
  let meterError: ApiError | null = null
  try {
    const data = await apiRequest('/credits/balance', { dataSchema: creditBalanceSchema, accessToken })
    balance = data.balance
  } catch (err) {
    meterError = asApiError(err)
  }

  let plans: Plan[] | null = null
  if (bot.status !== 'published') {
    try {
      // The backend already filters to active plans server-side.
      plans = await apiRequest('/plans/available', { dataSchema: planListSchema, accessToken })
    } catch {
      plans = null
    }
  }

  let embedUrl: string | null = null
  if (bot.status === 'published') {
    try {
      const published = await apiRequest('/chatbots/published', {
        dataSchema: publishedListSchema,
        accessToken,
      })
      embedUrl = published.find((item) => item.id === id)?.url ?? null
    } catch {
      embedUrl = null
    }
  }

  const documentStatusLabel = (status: string): string => {
    const known: Record<string, string> = {
      uploaded: 'Uploaded',
      processing: 'Processing',
      ready: 'Ready',
      failed: 'Failed',
    }
    return known[status] ?? status.charAt(0).toUpperCase() + status.slice(1)
  }

  return (
    <section aria-label={bot.name}>
      <ChatbotDetailHeader chatbotId={bot.id} name={bot.name} status={bot.status} plans={plans} />

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div>
          <h2 className="font-mono text-xs uppercase tracking-plate text-slate-ink">Documents</h2>
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
          ) : documents && documents.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {documents.map((document) => (
                <li
                  key={document.id}
                  data-testid="detail-document-row"
                  className="flex items-center gap-4 rounded-plate border border-hairline-slate bg-panel-warm px-4 py-3"
                >
                  <span className="min-w-0 truncate font-mono text-sm text-slate-ink">
                    {document.filename}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-slate-ink/60">
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

          {embedUrl && (
            <div className="mt-10">
              <EmbedSnippet url={embedUrl} />
            </div>
          )}
        </div>

        <aside>
          <UsageMeter monthlyLimit={0} used={0} prepaidBalance={balance} error={meterError} />
          {meterError && meterError.status !== 429 && (
            <p role="alert" className="mt-3 text-sm text-slate-ink/70">
              {meterError.message}
            </p>
          )}
        </aside>
      </div>
    </section>
  )
}
