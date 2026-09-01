import Link from 'next/link'
import { asApiError, ApiError } from '@/lib/api-errors'
import { getAccessToken, requireSession } from '@/lib/auth'
import {
  chatbotListSchema,
  documentListSchema,
  lineStateFromStatus,
  planListSchema,
  publishedListSchema,
  type ChatbotListItem,
  type DocumentRecord,
  type Plan,
} from '@/lib/api-schemas'
import { apiRequest } from '@/lib/api-client'
import { IndexRailCard } from '@/components/index-rail-card'
import { LineDetail } from '@/components/line-detail'
import { LineStatePill } from '@/components/line-state-pill'
import { RailUsage } from '@/components/rail-usage'

/**
 * The Operator's Board (WI-007 Task 12, redesigned per the locked
 * direction "The Index Rail"): the left rail is the index of lines —
 * every line an index card (name + state lamp), selectable — and the
 * main pane holds the selected line's full detail at full width. Zero
 * navigation: the old detail route is a redirect into the pane.
 *
 * Selection lives in the URL (`?line=<chatbotId>`) so deep links and
 * the wizard landing work. With no selection the pane shows the
 * fleet-at-a-glance summary; the plug-in CTA row sits at the pane's
 * foot (Patch Amber Deep — the Live Line Rule's primary control).
 *
 * A Server Component: the session gate and the company chatbot fetch
 * happen server-side with the Bearer token — the browser never sees
 * the token, and 429 renders the line-vocabulary 'On hold' surface.
 */
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ line?: string | string[] }>
}) {
  await requireSession()
  const accessToken = await getAccessToken()
  const params = await searchParams
  const requestedLineId = typeof params.line === 'string' ? params.line : undefined

  let lines: ChatbotListItem[] | null = null
  let error: ApiError | null = null
  try {
    lines = await apiRequest('/chatbots', { dataSchema: chatbotListSchema, accessToken })
  } catch (err) {
    error = asApiError(err)
  }

  // The selected line resolves from the company list; an unknown or
  // stale id falls back to the glance (no selection) — forgiving, in
  // keeping with a board that never dead-ends.
  const selectedBot =
    requestedLineId && lines ? (lines.find((bot) => bot.id === requestedLineId) ?? null) : null

  // The selected line's panel data: documents, plug plans, and (when
  // live) the embed URL — everything the API contract offers, fetched
  // server-side with the Bearer token.
  let documents: DocumentRecord[] | null = null
  let documentsError: ApiError | null = null
  let plans: Plan[] | null = null
  let embedUrl: string | null = null

  if (selectedBot) {
    try {
      const list = await apiRequest(`/chatbots/${encodeURIComponent(selectedBot.id)}/documents`, {
        dataSchema: documentListSchema,
        accessToken,
      })
      documents = list.documents
    } catch (err) {
      documentsError = asApiError(err)
    }

    if (selectedBot.status !== 'published') {
      try {
        // The backend already filters to active plans server-side.
        plans = await apiRequest('/plans/available', { dataSchema: planListSchema, accessToken })
      } catch {
        plans = null
      }
    }

    if (selectedBot.status === 'published') {
      try {
        const published = await apiRequest('/chatbots/published', {
          dataSchema: publishedListSchema,
          accessToken,
        })
        embedUrl = published.find((item) => item.id === selectedBot.id)?.url ?? null
      } catch {
        embedUrl = null
      }
    }
  }

  // Fleet-at-a-glance figures (the no-selection pane), read straight
  // from the company list — mono tabular figures, never hero metrics.
  const fleet = lines ?? []
  const liveCount = fleet.filter((bot) => bot.status === 'published').length
  const unpluggedCount = fleet.length - liveCount
  const wiredDocuments = fleet.reduce((sum, bot) => sum + bot.document_count, 0)

  return (
    <div className="grid gap-8 lg:grid-cols-[16rem_1fr] lg:gap-10">
      {/* ---- The index rail ---- */}
      <aside aria-label="Line index" className="flex min-w-0 flex-col">
        {/* Engraved divider label (locked card materials). */}
        <p className="hidden items-baseline justify-between font-mono text-xs uppercase tracking-plate text-slate-ink/70 lg:flex">
          Lines
          <span className="tabular-nums">{fleet.length}</span>
        </p>

        {!error && (
          <ul className="-mx-6 mt-3 flex gap-2 overflow-x-auto px-6 pb-2 lg:mx-0 lg:flex-col lg:gap-2 lg:overflow-visible lg:p-0 lg:pb-0">
            {fleet.map((bot) => (
              <li key={bot.id} className="shrink-0 lg:shrink">
                <IndexRailCard
                  id={bot.id}
                  name={bot.name}
                  lineState={lineStateFromStatus(bot.status)}
                  selected={selectedBot?.id === bot.id}
                />
              </li>
            ))}
          </ul>
        )}

        {/* Rail bottom: the company meter + the quiet plan link. Lives
            on the lg+ rail; below it the rail collapses to a strip and
            the credits pill + plan link ride the header instead. */}
        {!error && fleet.length > 0 && (
          <div className="mt-8 hidden lg:mt-auto lg:block">
            <RailUsage />
            <Link
              href="/board/plan"
              className="mt-4 inline-block font-mono text-xs uppercase tracking-plate text-slate-ink hover:text-slate-ink/70"
            >
              Plan &amp; credits
            </Link>
          </div>
        )}
      </aside>

      {/* ---- The main pane ---- */}
      <div className="flex min-w-0 flex-col">
        <div className="flex-1">
          {error ? (
            error.status === 429 ? (
              <div
                data-testid="board-on-hold"
                className="flex flex-col gap-3 rounded-card border border-hairline-slate bg-panel-warm p-6"
              >
                <h1 className="sr-only">Your lines</h1>
                <LineStatePill state="on hold" />
                <p className="text-sm leading-relaxed text-slate-ink/80">
                  The board is on hold. Top up your plan to bring your lines back.
                </p>
                <Link
                  href="/board/plan"
                  className="self-start rounded-plate border border-hairline-slate bg-panel-warm px-4 py-2 font-mono text-xs font-medium uppercase tracking-plate text-slate-ink hover:bg-well-warm"
                >
                  Go to plan
                </Link>
              </div>
            ) : (
              <div
                data-testid="board-error"
                className="rounded-card border border-hairline-slate bg-panel-warm p-6"
              >
                <h1 className="sr-only">Your lines</h1>
                <p role="alert" className="text-sm leading-relaxed text-slate-ink/80">
                  {error.message}
                </p>
              </div>
            )
          ) : fleet.length === 0 ? (
            <div
              data-testid="board-empty"
              className="flex flex-col gap-3 rounded-card border border-hairline-slate bg-panel-warm p-10"
            >
              {/* The unplugged board, inviting its first line. */}
              <span
                aria-hidden
                className="flex size-11 items-center justify-center rounded-jack bg-slate-ink"
              >
                <span className="size-3 rounded-jack bg-operators-ivory" />
              </span>
              <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-ink">
                No lines on the board yet
              </h1>
              <p className="max-w-md text-sm leading-relaxed text-slate-ink/70">
                Every line starts the same way: give it a name, wire in a few documents, and plug
                it in. Your customers&rsquo; questions get answered from your own knowledge.
              </p>
            </div>
          ) : selectedBot ? (
            <LineDetail
              bot={selectedBot}
              documents={documents}
              documentsError={documentsError}
              plans={plans}
              embedUrl={embedUrl}
            />
          ) : (
            <section aria-labelledby="board-glance-title" data-testid="board-glance">
              <h1 id="board-glance-title" className="text-3xl font-semibold tracking-tight text-slate-ink">
                Your lines
              </h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-ink/70">
                Pick a line from the index — its full panel opens here: state, documents, and the
                embed once it goes live.
              </p>

              {/* The fleet readout: engraved labels, mono tabular figures
                  — instrumentation, not hero metrics. */}
              <div className="mt-8 rounded-card border border-hairline-slate bg-panel-warm p-5">
                <ul className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs uppercase tracking-plate text-slate-ink">
                  <li className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`size-1.5 rounded-jack ${liveCount > 0 ? 'bg-patch-amber' : 'bg-slate-ink/40'}`}
                    />
                    Live <span className="tabular-nums">{liveCount}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span aria-hidden className="size-1.5 rounded-jack bg-slate-ink/40" />
                    Unplugged <span className="tabular-nums">{unpluggedCount}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    Documents wired <span className="tabular-nums">{wiredDocuments}</span>
                  </li>
                </ul>
              </div>
            </section>
          )}
        </div>

        {/* The plug-in CTA row — the pane's foot, always reachable. Not
            shown while the board itself is on hold or failing: the
            operator's next step there is the plan surface, not a plug. */}
        {!error && (
          <div className="mt-10 flex items-center justify-end border-t border-hairline-slate pt-6">
            <Link
              href="/board/wizard"
              data-testid="plug-new-line"
              className="rounded-plug bg-patch-amber-deep px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-plate text-operators-ivory hover:bg-patch-amber-deep/90"
            >
              Plug in a new line
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
