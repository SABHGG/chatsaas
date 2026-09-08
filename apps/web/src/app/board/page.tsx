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
import { Button } from '@/components/ui/button'
import { IndexRailCard } from '@/components/index-rail-card'
import { LineDetail } from '@/components/line-detail'
import { LineStatePill } from '@/components/line-state-pill'
import { RailUsage } from '@/components/rail-usage'
import { StateLegend } from '@/components/state-legend'

/**
 * The Operator's Board: the left rail is the index of lines — every
 * line an index card (name + state lamp), selectable — and the main
 * pane holds the selected line's full detail at full width. Zero
 * navigation: the old detail route is a redirect into the pane.
 *
 * Selection lives in the URL (`?line=<chatbotId>`) so deep links and
 * the wizard landing work. With no selection the pane shows the
 * fleet-at-a-glance summary; the plug-in CTA row sits at the pane's
 * foot (the primary control).
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
      {/* ---- The strip rack ---- */}
      <aside aria-label="Line index" className="flex min-w-0 flex-col">
        {/* The rack header: mono, like every instrument label. */}
        <p className="label-mono hidden items-baseline justify-between text-muted-foreground lg:flex">
          Lines
          <span className="readout-mono">{fleet.length}</span>
        </p>

        {!error && (
          <ul className="-mx-6 mt-3 flex gap-2 overflow-x-auto px-6 pb-2 lg:mx-0 lg:flex-col lg:gap-2 lg:overflow-visible lg:border-x lg:border-border lg:bg-foreground/[0.03] lg:p-2 lg:pb-2">
            {fleet.map((bot) => (
              <li key={bot.id} className="shrink-0 lg:shrink">
                <IndexRailCard
                  id={bot.id}
                  name={bot.name}
                  lineState={lineStateFromStatus(bot.status)}
                  selected={selectedBot?.id === bot.id}
                  documentCount={bot.document_count}
                />
              </li>
            ))}
          </ul>
        )}

        {/* Rack bottom: the state legend (fixed, level — it never moves
            while content changes), the company meter, and the quiet plan
            link. Lives on the lg+ rail; below it the rail collapses to a
            strip and the credits pill + plan link ride the header. */}
        {!error && fleet.length > 0 && (
          <div className="mt-8 hidden lg:mt-auto lg:block">
            <RailUsage />
            <Link
              href="/board/plan"
              className="label-mono mt-4 inline-block text-muted-foreground hover:text-foreground"
            >
              Plan &amp; credits
            </Link>
          </div>
        )}

        {!error && <StateLegend />}
      </aside>

      {/* ---- The workspace pane ---- */}
      <div className="flex min-w-0 flex-col">
        <div className="flex-1">
          {error ? (
            error.status === 429 ? (
              <div
                data-testid="board-on-hold"
                className="relative flex flex-col gap-3 border border-border bg-card p-6 text-card-foreground"
              >
                {/* The board itself is held: the bar crosses the panel. */}
                <span aria-hidden className="hold-bar">Hold</span>
                <h1 className="sr-only">Your lines</h1>
                <LineStatePill state="on hold" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  The board is on hold. Top up your plan to bring your lines back.
                </p>
                <Button asChild variant="outline" className="self-start">
                  <Link href="/board/plan">Go to plan</Link>
                </Button>
              </div>
            ) : (
              <div
                data-testid="board-error"
                className="border border-border bg-card p-6 text-card-foreground"
              >
                <h1 className="sr-only">Your lines</h1>
                <p role="alert" className="text-sm leading-relaxed text-muted-foreground">
                  {error.message}
                </p>
              </div>
            )
          ) : fleet.length === 0 ? (
            <div
              data-testid="board-empty"
              className="flex flex-col gap-3 border border-border bg-card p-10 text-card-foreground"
            >
              {/* The unplugged board, inviting its first line: an empty
                  strip slot, waiting to be filled. */}
              <span
                aria-hidden
                className="h-16 w-28 border border-dashed border-foreground/40 bg-background/40"
              />
              <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                No lines on the board yet
              </h1>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
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
              <h1 id="board-glance-title" className="text-3xl font-semibold tracking-tight text-foreground">
                Your lines
              </h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                Pick a line from the index — its full panel opens here: state, documents, and the
                embed once it goes live.
              </p>

              {/* The fleet readout: monospaced instrument figures with a
                  swatch per state — the legend's grammar, applied. */}
              <div className="mt-8 border border-border bg-card p-5 text-card-foreground">
                <ul className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`size-2.5 ${liveCount > 0 ? 'bg-stamp' : 'border border-border'}`}
                    />
                    Live <span className="readout-mono text-foreground">{liveCount}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span aria-hidden className="size-2.5 border border-border bg-card" />
                    Unplugged <span className="readout-mono text-foreground">{unpluggedCount}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    Documents wired <span className="readout-mono text-foreground">{wiredDocuments}</span>
                  </li>
                </ul>
              </div>
            </section>
          )}
        </div>

        {/* The NEW LINE lever — the pane's foot, bottom-left, the only
            red control at rest. Not shown while the board itself is on
            hold or failing: the operator's next step there is the plan
            surface, not a new line. */}
        {!error && (
          <div className="mt-10 flex items-center justify-start border-t border-border pt-6">
            <Button asChild variant="stamp" data-testid="plug-new-line" className="label-mono px-4">
              <Link href="/board/wizard">Plug in a new line</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
