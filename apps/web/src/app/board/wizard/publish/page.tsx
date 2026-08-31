'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useHydrated } from '@/lib/use-hydrated'
import {
  clearWizardRefs,
  readChatbotRef,
  readPlanRef,
} from '@/lib/wizard-refs'
import {
  documentListSchema,
  planListSchema,
  publishResponseSchema,
  type Plan,
} from '@/lib/api-schemas'
import { proxyRequest } from '@/lib/bff-request'
import { NEW_CHATBOT_ID, createWizardStore } from '@/components/wizard-store'
import { useOperatorId } from '@/components/operator-context'
import { JackCard } from '@/components/jack-card'
import { DIALOG_CANCEL_CLASS, DIALOG_PRIMARY_CLASS, Dialog } from '@/components/dialog'

/**
 * Step 4 — the plug-in moment (WI-007 Task 11). Publishing rides the
 * BFF proxy (`POST /chatbots/:id/publish`). While the request is in
 * flight the jack reads `connecting`; on success the ONE patch-cord
 * click plays on a live jack (`justPlugged` — reserved for exactly this
 * moment, never on board renders), the draft is spent, and the operator
 * lands on the detail page with the line visibly live.
 *
 * DC-007-2: publishing with 0 ready documents first shows the in-world
 * confirmation dialog — never `window.confirm`.
 *
 * Step guards: post-hydration client redirects (DC-007-5) — missing
 * name, chatbot, or plan each send the operator to the right step. They
 * hold only while the step is live: once the plug lands, the draft is
 * spent and the guards stand down. Storage refs are read during render
 * (gated); effects setState only from async callbacks.
 */

type PublishPhase = 'ready' | 'connecting' | 'plugged' | 'error'

/** The beat the operator gets to watch the jack light before landing. */
const LANDING_DELAY_MS = 1200

export default function WizardPublishPage() {
  const operatorId = useOperatorId()
  const router = useRouter()
  const hydrated = useHydrated()

  const store = useMemo(() => createWizardStore(operatorId, NEW_CHATBOT_ID), [operatorId])

  const [phase, setPhase] = useState<PublishPhase>('ready')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readyCount, setReadyCount] = useState<number | null>(null)
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [pluggedName, setPluggedName] = useState('')
  const landingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Persisted-store values render only after hydration (DC-007-5).
  const storeName = store((state) => state.name)
  const documents = store((state) => state.documents)
  const draftName = hydrated ? storeName : ''
  const draftCount = hydrated ? documents.length : 0

  // Render-time reads of the draft's server-side refs (gated, DC-007-5).
  const chatbotId = hydrated ? readChatbotRef(operatorId) : null
  const planId = hydrated ? readPlanRef(operatorId) : null

  // Guards + server wiring, after hydration.
  useEffect(() => {
    if (!hydrated || phase !== 'ready') return
    if (!store.getState().name.trim()) {
      router.replace('/board/wizard')
      return
    }
    if (!readChatbotRef(operatorId)) {
      router.replace('/board/wizard/documents')
      return
    }
    if (!readPlanRef(operatorId)) {
      router.replace('/board/wizard/review')
      return
    }

    const currentChatbotId = readChatbotRef(operatorId)!
    let cancelled = false
    proxyRequest(`/chatbots/${encodeURIComponent(currentChatbotId)}/documents`, {
      dataSchema: documentListSchema,
    })
      .then((list) => {
        if (cancelled) return
        setReadyCount(list.documents.filter((doc) => doc.status === 'ready').length)
      })
      .catch(() => {
        if (cancelled) return
        // Unreadable readiness counts as none — DC-007-2 gates the publish.
        setReadyCount(0)
      })
    // The backend already filters to active plans server-side.
    proxyRequest('/plans/available', { dataSchema: planListSchema })
      .then((all) => {
        if (cancelled) return
        setPlans(all)
      })
      .catch(() => {
        if (cancelled) return
        setPlans(null)
      })
    return () => {
      cancelled = true
    }
  }, [hydrated, operatorId, phase, router, store])

  useEffect(() => {
    return () => {
      if (landingTimer.current) clearTimeout(landingTimer.current)
    }
  }, [])

  const chosenPlan = plans?.find((plan) => plan.id === planId) ?? null

  const publish = async () => {
    if (!chatbotId || !planId) return
    setConfirmOpen(false)
    setPhase('connecting')
    setError(null)
    try {
      const response = await proxyRequest(`/chatbots/${encodeURIComponent(chatbotId)}/publish`, {
        method: 'POST',
        body: { plan_id: planId },
        dataSchema: publishResponseSchema,
      })
      if (!response.url) throw new Error('The board didn\u2019t return the line\u2019s address.')

      // The plug lands: light the jack, spend the draft.
      setPluggedName(store.getState().name.trim())
      setPhase('plugged')
      store.getState().reset()
      clearWizardRefs(operatorId)

      landingTimer.current = setTimeout(() => {
        router.push(`/board/chatbots/${chatbotId}`)
      }, LANDING_DELAY_MS)
    } catch (err) {
      setPhase('error')
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    }
  }

  const onPlugClick = () => {
    if (readyCount === 0) {
      // DC-007-2: permissive, but never silent — confirm first, in-world.
      setConfirmOpen(true)
      return
    }
    void publish()
  }

  if (phase === 'plugged') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16" data-testid="wizard-plugged">
        <div className="w-full max-w-xl">
          <JackCard name={pluggedName || 'Your line'} lineState="live" justPlugged />
        </div>
        <p className="text-center text-base text-slate-ink">
          The line is live. Taking you to the board&hellip;
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col" data-testid="wizard-publish">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-ink">Plug the line in</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-ink/70">
        One last look. Plugging in puts the line on your site the moment it lands.
      </p>

      <div className="mt-8 rounded-card border border-hairline-slate bg-panel-warm p-5">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <JackCard
              name={draftName || 'Unnamed line'}
              lineState={phase === 'connecting' ? 'connecting' : 'unplugged'}
            />
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt className="font-mono text-xs uppercase tracking-plate text-slate-ink/70">Name</dt>
          <dd data-testid="publish-summary-name" className="text-slate-ink">
            {draftName || '—'}
          </dd>
          <dt className="font-mono text-xs uppercase tracking-plate text-slate-ink/70">Documents</dt>
          <dd data-testid="publish-summary-docs" className="text-slate-ink">
            {draftCount} wired · {readyCount == null ? 'checking readiness…' : `${readyCount} ready`}
          </dd>
          <dt className="font-mono text-xs uppercase tracking-plate text-slate-ink/70">Plan</dt>
          <dd data-testid="publish-summary-plan" className="text-slate-ink">
            {chosenPlan ? chosenPlan.name : planId ? <span className="font-mono text-xs">{planId}</span> : '—'}
          </dd>
        </dl>
      </div>

      {phase === 'error' && error && (
        <p role="alert" data-testid="publish-error" className="mt-4 text-sm text-slate-ink">
          {error}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between pt-6">
        <button
          type="button"
          onClick={() => router.push('/board/wizard/review')}
          className="font-mono text-xs uppercase tracking-plate text-slate-ink hover:text-slate-ink/70"
        >
          Back
        </button>
        <button
          type="button"
          data-testid="wizard-plug"
          disabled={phase === 'connecting' || !chatbotId || !planId}
          onClick={onPlugClick}
          className="rounded-plug bg-patch-amber-deep px-6 py-2.5 font-mono text-xs font-semibold uppercase tracking-plate text-operators-ivory hover:bg-patch-amber-deep/90 disabled:opacity-60"
        >
          {phase === 'connecting' ? 'Plugging in…' : 'Plug in'}
        </button>
      </div>

      {/* DC-007-2 — the in-world confirmation for a 0-ready publish. */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Publish without ready documents?"
        actions={
          <>
            <button type="button" onClick={() => setConfirmOpen(false)} className={DIALOG_CANCEL_CLASS}>
              Not yet
            </button>
            <button
              type="button"
              data-testid="publish-confirm"
              onClick={() => void publish()}
              className={DIALOG_PRIMARY_CLASS}
            >
              Publish anyway
            </button>
          </>
        }
      >
        <p>
          This line has no ready documents, so answers won&rsquo;t come from your knowledge yet.
          You can publish now and wire documents in later — or wait until they finish processing.
        </p>
      </Dialog>
    </div>
  )
}
