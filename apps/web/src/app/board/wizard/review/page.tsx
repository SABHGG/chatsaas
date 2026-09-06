'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useHydrated } from '@/lib/use-hydrated'
import {
  readChatbotRef,
  readPlanRef,
  writePlanRef,
} from '@/lib/wizard-refs'
import { documentListSchema, planListSchema, planPriceLabel, type Plan } from '@/lib/api-schemas'
import { proxyRequest } from '@/lib/bff-request'
import { Button } from '@/components/ui/button'
import { NEW_CHATBOT_ID, createWizardStore } from '@/components/wizard-store'
import { useOperatorId } from '@/components/operator-context'

/**
 * Step 3 — review the line: readiness (how many documents have finished
 * processing, straight from the API — the draft only knows 'uploaded')
 * and the plan picker (GET /plans/available through the BFF proxy). The
 * picked plan id is written straight to sessionStorage
 * (lib/wizard-refs.ts) so the publish step has its plan_id even after a
 * reload.
 *
 * Step guard: post-hydration client redirect — no name from step 1
 * sends the operator back to step 1. Storage refs are read during
 * render, gated by the hydration guard; effects only setState from
 * async callbacks.
 */
export default function WizardReviewPage() {
  const operatorId = useOperatorId()
  const router = useRouter()
  const hydrated = useHydrated()

  const store = useMemo(() => createWizardStore(operatorId, NEW_CHATBOT_ID), [operatorId])

  const [readiness, setReadiness] = useState<{ ready: number; total: number } | null>(null)
  const [pickedPlanId, setPickedPlanId] = useState<string | null>(null)
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [plansError, setPlansError] = useState<string | null>(null)

  // Render-time reads of the draft's server-side refs (gated, so the
  // hydrating render matches the server output).
  const hasChatbot = hydrated ? readChatbotRef(operatorId) !== null : false
  const planId = pickedPlanId ?? (hydrated ? readPlanRef(operatorId) : null)

  // Guard + readiness read, after hydration.
  useEffect(() => {
    if (!hydrated) return
    if (!store.getState().name.trim()) {
      router.replace('/board/wizard')
      return
    }

    const chatbotId = readChatbotRef(operatorId)
    if (!chatbotId) {
      // The draft never left step 1: nothing has been processed yet —
      // readiness stays null and renders as 0 of 0.
      return
    }

    let cancelled = false
    proxyRequest(`/chatbots/${encodeURIComponent(chatbotId)}/documents`, {
      dataSchema: documentListSchema,
    })
      .then((list) => {
        if (cancelled) return
        const docs = list.documents
        setReadiness({
          ready: docs.filter((doc) => doc.status === 'ready').length,
          total: docs.length,
        })
      })
      .catch(() => {
        if (cancelled) return
        // Readiness is advisory; the publish step re-checks and the
        // 0-ready publish stays behind the confirmation dialog.
        setReadiness({ ready: 0, total: 0 })
      })
    return () => {
      cancelled = true
    }
  }, [hydrated, operatorId, router, store])

  // Plans, after hydration. The backend already filters to active plans
  // server-side (the wire shape carries no status field).
  useEffect(() => {
    if (!hydrated) return
    let cancelled = false
    proxyRequest('/plans/available', { dataSchema: planListSchema })
      .then((all) => {
        if (cancelled) return
        setPlans(all)
        setPlansError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setPlansError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
      })
    return () => {
      cancelled = true
    }
  }, [hydrated, operatorId])

  const pickPlan = (id: string) => {
    setPickedPlanId(id)
    writePlanRef(operatorId, id)
  }

  const storeName = store((state) => state.name)
  const documents = store((state) => state.documents)
  // Persisted-store values render only after hydration.
  const draftName = hydrated ? storeName : ''
  const draftCount = hydrated ? documents.length : 0

  return (
    <div className="flex flex-1 flex-col" data-testid="wizard-review">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Review the line</h1>

      {/* The manifest sheet — machine-precise mono readouts on paper. */}
      <div className="mt-6 border border-border bg-card p-5 text-card-foreground">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium text-foreground">
            {draftName || 'Unnamed line'}
          </h2>
          <span
            data-testid="wizard-readiness"
            className="readout-mono text-xs text-muted-foreground"
          >
            {!hasChatbot
              ? '0 of 0 documents ready'
              : readiness
                ? `${readiness.ready} of ${readiness.total} documents ready`
                : 'Checking documents…'}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {draftCount} wired in this session. Ready documents are answered from; the rest finish
          processing on their own.
        </p>
      </div>

      {/* Plan picker — strip rows from the API; the picker is a choice,
          not the stamp. */}
      <h2 className="label-mono mt-8 text-foreground">
        Choose the plan
      </h2>
      <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="Plan">
        {(plans ?? []).map((plan) => (
          <label
            key={plan.id}
            data-testid={`plan-option-${plan.id}`}
            className={`flex cursor-pointer items-center justify-between gap-4 border px-4 py-3 text-sm ${
              planId === plan.id
                ? 'border-foreground/70 bg-accent text-accent-foreground'
                : 'border-border bg-card text-card-foreground hover:border-foreground/40'
            }`}
          >
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="review-plan"
                value={plan.id}
                checked={planId === plan.id}
                onChange={() => pickPlan(plan.id)}
                className="accent-foreground"
              />
              <span className="text-sm font-medium">{plan.name}</span>
            </span>
            <span className="readout-mono text-xs text-muted-foreground">
              {planPriceLabel(plan)}
            </span>
          </label>
        ))}
        {plansError && (
          <p role="alert" className="text-sm text-foreground">
            {plansError}
          </p>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between pt-6">
        <Link
          href="/board/wizard/documents"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Back
        </Link>
        <Button
          type="button"
          data-testid="wizard-continue"
          disabled={!hydrated || !planId}
          onClick={() => {
            store.getState().goToStep('publish')
            router.push('/board/wizard/publish')
          }}
        >
          Continue
        </Button>
      </div>
    </div>
  )
}
