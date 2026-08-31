import Link from 'next/link'
import { asApiError, ApiError } from '@/lib/api-errors'
import { getAccessToken, requireSession } from '@/lib/auth'
import { chatbotListSchema, lineStateFromStatus, type ChatbotListItem } from '@/lib/api-schemas'
import { apiRequest } from '@/lib/api-client'
import { JackCard } from '@/components/jack-card'
import { LineStatePill } from '@/components/line-state-pill'

/**
 * "Your lines" (WI-007 Task 12): the board. Each chatbot is a labeled
 * jack row; the create control is the plug (Patch Amber, Live Line
 * Rule). A Server Component: the session gate and the company chatbot
 * fetch happen server-side with the Bearer token — the browser never
 * sees the token, and 429 renders the line-vocabulary 'On hold' surface.
 */
export default async function BoardPage() {
  await requireSession()
  const accessToken = await getAccessToken()

  let lines: ChatbotListItem[] | null = null
  let error: ApiError | null = null
  try {
    lines = await apiRequest('/chatbots', { dataSchema: chatbotListSchema, accessToken })
  } catch (err) {
    error = asApiError(err)
  }

  return (
    <section aria-label="Your lines">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-ink">Your lines</h1>
        <Link
          href="/board/wizard"
          data-testid="plug-new-line"
          className="rounded-plug bg-patch-amber-deep px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-plate text-operators-ivory hover:bg-patch-amber-deep/90"
        >
          Plug in a new line
        </Link>
      </div>

      {error ? (
        error.status === 429 ? (
          <div
            data-testid="board-on-hold"
            className="mt-8 flex flex-col gap-3 rounded-card border border-hairline-slate bg-panel-warm p-6"
          >
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
            className="mt-8 rounded-card border border-hairline-slate bg-panel-warm p-6"
          >
            <p role="alert" className="text-sm leading-relaxed text-slate-ink/80">
              {error.message}
            </p>
          </div>
        )
      ) : lines && lines.length === 0 ? (
        <div
          data-testid="board-empty"
          className="mt-8 flex flex-col gap-3 rounded-card border border-hairline-slate bg-panel-warm p-10"
        >
          {/* The unplugged board, inviting its first line. */}
          <span
            aria-hidden
            className="flex size-11 items-center justify-center rounded-jack bg-slate-ink"
          >
            <span className="size-3 rounded-jack bg-operators-ivory" />
          </span>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-ink">
            No lines on the board yet
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-slate-ink/70">
            Every line starts the same way: give it a name, wire in a few documents, and plug it
            in. Your customers&rsquo; questions get answered from your own knowledge.
          </p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-4">
          {(lines ?? []).map((bot) => (
            <Link
              key={bot.id}
              href={`/board/chatbots/${bot.id}`}
              data-testid="board-line-link"
              className="block"
            >
              <JackCard name={bot.name} lineState={lineStateFromStatus(bot.status)} />
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
