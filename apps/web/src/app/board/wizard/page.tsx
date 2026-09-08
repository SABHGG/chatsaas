'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ensureDraftChatbot, readChatbotRef, verifyChatbotRef } from '@/lib/wizard-refs'
import { useHydrated } from '@/lib/use-hydrated'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NEW_CHATBOT_ID, createWizardStore } from '@/components/wizard-store'
import { useOperatorId } from '@/components/operator-context'

/**
 * Step 1 — name the line. The draft lives in the zustand persist store
 * keyed to this operator; the input reads straight from it (gated by
 * the hydration guard). Continuing mints the draft chatbot on the API
 * exactly once (the id is cached in sessionStorage — lib/wizard-refs.ts)
 * so documents and publish have a server-side line to wire into.
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

  // Stale-draft guard: the persisted draft restores the name (R-3), but
  // a draft whose line already left the wizard — e.g. published from the
  // detail page — is spent. Clear it on mount so the stale name cannot
  // mint a duplicate line. Advisory pre-clear only: the binding adoption
  // guard lives in ensureDraftChatbot (lib/wizard-refs.ts), which
  // re-verifies at continue time and surfaces verification failures.
  useEffect(() => {
    if (!hydrated) return
    // No minted chatbot: the persisted name is a legitimate unfinished
    // draft — never reset it.
    if (!readChatbotRef(operatorId)) return
    let cancelled = false
    verifyChatbotRef(operatorId)
      .then((adoptable) => {
        if (!cancelled && !adoptable) store.getState().reset()
      })
      .catch(() => {
        // Unverifiable is not spent — leave the draft alone here.
      })
    return () => {
      cancelled = true
    }
  }, [hydrated, operatorId, store])

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
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Name the line</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Give the line a name your customers will recognize — the counter desk, the shop, the
        service.
      </p>

      <div className="mt-8">
        <Label htmlFor="wizard-name-input">Line name</Label>
        <Input
          id="wizard-name-input"
          data-testid="wizard-name-input"
          type="text"
          maxLength={100}
          value={name}
          onChange={(event) => store.getState().setName(event.target.value)}
          placeholder="Front desk"
          className="mt-2 h-auto max-w-md py-3"
        />
      </div>

      {error && (
        <p role="alert" data-testid="wizard-error" className="mt-4 text-sm text-foreground">
          {error}
        </p>
      )}

      <div className="mt-auto flex items-center justify-end pt-6">
        <Button
          type="submit"
          data-testid="wizard-continue"
          disabled={!name.trim() || creating}
        >
          {creating ? 'Wiring…' : 'Continue'}
        </Button>
      </div>
    </form>
  )
}
