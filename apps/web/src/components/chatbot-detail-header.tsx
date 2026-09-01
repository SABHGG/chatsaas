'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { proxyRequest } from '@/lib/bff-request'
import { ApiError } from '@/lib/api-errors'
import { lineStateFromStatus, planPriceLabel, publishResponseSchema, type Plan } from '@/lib/api-schemas'
import { JackCard } from './jack-card'
import { DIALOG_CANCEL_CLASS, DIALOG_INK_CLASS, DIALOG_PRIMARY_CLASS, Dialog } from './dialog'
import { z } from 'zod'

/**
 * The plug and the unplug (WI-007 Task 13): the detail page's publish /
 * unpublish controls, owning the jack they act on.
 *
 * - Plug (publish): Patch Amber, the primary publish control (Live Line
 *   Rule). Opens the plan dialog — the API requires a `plan_id` — then
 *   publishes through the BFF proxy. While the request is in flight the
 *   jack reads `connecting` (the cord is being plugged); on success the
 *   card plays the ONE patch-cord click (`justPlugged` — allowed here,
 *   this IS a publish moment) and the page refreshes with the line live.
 * - Unplug (unpublish): ink control with its own confirmation dialog.
 *   The API contract (api-spec.md) does not define an unpublish endpoint
 *   yet; the call targets `POST /chatbots/:id/unpublish` and surfaces a
 *   targeted operator message when the board answers 404 until the
 *   backend wires it up.
 */
export interface ChatbotDetailHeaderProps {
  chatbotId: string
  name: string
  status: string
  /** Available plans, fetched server-side; needed only for the plug dialog. */
  plans: Plan[] | null
}

export function ChatbotDetailHeader({ chatbotId, name, status, plans }: ChatbotDetailHeaderProps) {
  const router = useRouter()
  const [currentStatus, setCurrentStatus] = useState(status)
  const [pending, setPending] = useState<'publish' | 'unpublish' | null>(null)
  const [dialog, setDialog] = useState<'publish' | 'unpublish' | null>(null)
  const [justPlugged, setJustPlugged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [planId, setPlanId] = useState<string | null>(plans?.[0]?.id ?? null)

  const lineState = justPlugged ? 'live' : lineStateFromStatus(currentStatus)

  const publish = async () => {
    if (!planId) return
    setDialog(null)
    setPending('publish')
    setError(null)
    try {
      await proxyRequest(`/chatbots/${encodeURIComponent(chatbotId)}/publish`, {
        method: 'POST',
        body: { plan_id: planId },
        dataSchema: publishResponseSchema,
      })
      setCurrentStatus('published')
      setJustPlugged(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setPending(null)
    }
  }

  const unpublish = async () => {
    setDialog(null)
    setPending('unpublish')
    setError(null)
    try {
      await proxyRequest(`/chatbots/${encodeURIComponent(chatbotId)}/unpublish`, {
        method: 'POST',
        // The endpoint's response shape is not in the contract yet; accept
        // whatever the board answers and re-read state via router.refresh().
        dataSchema: z.unknown(),
      })
      setCurrentStatus('draft')
      setJustPlugged(false)
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        // The backend hasn't wired the unplug yet (see file header).
        setError('Unplugging isn\u2019t wired up on the board yet. Contact us to take a line off the board.')
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
      }
    } finally {
      setPending(null)
    }
  }

  const isLive = currentStatus === 'published'

  return (
    <div data-testid="chatbot-detail-header">
      {/* The jack card owns the state pill on its trailing edge — exactly
          one pill, never a second beside it. */}
      <JackCard name={name} lineState={lineState} justPlugged={justPlugged} />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!isLive && (
          <button
            type="button"
            data-testid="plug-open"
            disabled={pending !== null}
            onClick={() => setDialog('publish')}
            className="rounded-plug bg-patch-amber-deep px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-plate text-operators-ivory hover:bg-patch-amber-deep/90 disabled:opacity-60"
          >
            {pending === 'publish' ? 'Plugging in…' : 'Plug in'}
          </button>
        )}
        {isLive && (
          <button
            type="button"
            data-testid="unplug-open"
            disabled={pending !== null}
            onClick={() => setDialog('unpublish')}
            className="rounded-plug border border-hairline-slate bg-panel-warm px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-plate text-slate-ink hover:bg-well-warm disabled:opacity-60"
          >
            {pending === 'unpublish' ? 'Unplugging…' : 'Unplug'}
          </button>
        )}
        {error && (
          <p role="alert" data-testid="detail-error" className="text-sm text-slate-ink">
            {error}
          </p>
        )}
      </div>

      <Dialog
        open={dialog === 'publish'}
        onClose={() => setDialog(null)}
        title="Plug this line in"
        actions={
          <>
            <button type="button" onClick={() => setDialog(null)} className={DIALOG_CANCEL_CLASS}>
              Not now
            </button>
            <button
              type="button"
              data-testid="plug-confirm"
              disabled={!planId || pending !== null}
              onClick={() => void publish()}
              className={DIALOG_PRIMARY_CLASS}
            >
              Plug in
            </button>
          </>
        }
      >
        <p>Pick the plan this line rides on. You can change it later from the Plan page.</p>
        <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="Plan">
          {(plans ?? []).map((plan) => (
            <label
              key={plan.id}
              data-testid={`plan-option-${plan.id}`}
              className={`flex cursor-pointer items-center justify-between gap-4 rounded-plate border px-4 py-3 ${
                planId === plan.id ? 'border-slate-ink bg-well-warm' : 'border-hairline-slate bg-panel-warm'
              }`}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="detail-plan"
                  value={plan.id}
                  checked={planId === plan.id}
                  onChange={() => setPlanId(plan.id)}
                  className="accent-slate-ink"
                />
                <span className="text-sm font-medium text-slate-ink">{plan.name}</span>
              </span>
              <span className="font-mono text-xs tabular-nums text-slate-ink/70">
                {planPriceLabel(plan)}
              </span>
            </label>
          ))}
          {plans && plans.length === 0 && (
            <p className="text-sm text-slate-ink/70">No plans are open right now. Contact us to get on the board.</p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={dialog === 'unpublish'}
        onClose={() => setDialog(null)}
        title="Unplug this line"
        actions={
          <>
            <button type="button" onClick={() => setDialog(null)} className={DIALOG_CANCEL_CLASS}>
              Not now
            </button>
            <button
              type="button"
              data-testid="unplug-confirm"
              disabled={pending !== null}
              onClick={() => void unpublish()}
              className={DIALOG_INK_CLASS}
            >
              Unplug
            </button>
          </>
        }
      >
        <p>
          Visitors will stop reaching this chatbot the moment the line comes off the board. Your
          documents stay wired in — plug it back in any time.
        </p>
      </Dialog>
    </div>
  )
}
