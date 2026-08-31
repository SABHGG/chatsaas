'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ensureDraftChatbot } from '@/lib/wizard-refs'
import { useHydrated } from '@/lib/use-hydrated'
import { NEW_CHATBOT_ID, createWizardStore } from '@/components/wizard-store'
import { useOperatorId } from '@/components/operator-context'

/**
 * Step 1 — name the line (WI-007 Task 11). The draft lives in the
 * zustand persist store keyed to this operator; the input reads straight
 * from it (gated by the hydration guard, DC-007-5). Continuing mints the
 * draft chatbot on the API exactly once (the id is cached in
 * sessionStorage — lib/wizard-refs.ts) so documents and publish have a
 * server-side line to wire into.
 */
export default function WizardNamePage() {
  const operatorId = useOperatorId()
  const router = useRouter()
  const hydrated = useHydrated()

  // One store per draft key, created inside useMemo — never per render.
  const store = useMemo(() => createWizardStore(operatorId, NEW_CHATBOT_ID), [operatorId])
  const storeName = store((state) => state.name)
  const name = hydrated ? storeName : ''

  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onContinue = async () => {
    const trimmed = name.trim()
    if (!trimmed || creating) return
    setCreating(true)
    setError(null)
    try {
      await ensureDraftChatbot(operatorId, trimmed)
      store.getState().goToStep('documents')
      router.push('/board/wizard/documents')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <form
      data-testid="wizard-name"
      onSubmit={(event) => {
        event.preventDefault()
        void onContinue()
      }}
      className="flex flex-1 flex-col"
    >
      <h1 className="text-2xl font-semibold tracking-tight text-slate-ink">Name the line</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-ink/70">
        Give the line a name your customers will recognize — the counter desk, the shop, the
        service.
      </p>

      <div className="mt-8">
        <label
          htmlFor="wizard-name-input"
          className="font-mono text-xs uppercase tracking-plate text-slate-ink"
        >
          Line name
        </label>
        <input
          id="wizard-name-input"
          data-testid="wizard-name-input"
          type="text"
          maxLength={100}
          value={name}
          onChange={(event) => store.getState().setName(event.target.value)}
          placeholder="Front desk"
          className="mt-2 w-full max-w-md rounded-card border border-hairline-slate bg-panel-warm px-4 py-3 text-base text-slate-ink placeholder:text-slate-ink/70"
        />
      </div>

      {error && (
        <p role="alert" data-testid="wizard-error" className="mt-4 text-sm text-slate-ink">
          {error}
        </p>
      )}

      <div className="mt-auto flex items-center justify-end pt-6">
        <button
          type="submit"
          data-testid="wizard-continue"
          disabled={!name.trim() || creating}
          className="rounded-plug bg-slate-ink px-6 py-2.5 font-mono text-xs font-semibold uppercase tracking-plate text-operators-ivory hover:bg-slate-ink/90 disabled:opacity-60"
        >
          {creating ? 'Wiring…' : 'Continue'}
        </button>
      </div>
    </form>
  )
}
