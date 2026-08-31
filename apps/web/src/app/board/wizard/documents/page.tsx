'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useHydrated } from '@/lib/use-hydrated'
import { ensureDraftChatbot } from '@/lib/wizard-refs'
import { NEW_CHATBOT_ID, createWizardStore } from '@/components/wizard-store'
import { useOperatorId } from '@/components/operator-context'
import { FileDropzone } from '@/components/file-dropzone'

/**
 * Step 2 — wire in documents (WI-007 Task 11). The dropzone uploads
 * through the BFF proxy with progress; each uploaded document joins the
 * persisted draft and can be removed from the list.
 *
 * Step guard (deviation, recorded): the draft lives in localStorage,
 * which the SERVER cannot read, so the yml's "SSR redirect" is
 * implemented as a post-hydration client redirect (DC-007-5) — without
 * the name from step 1, the operator is sent back to step 1.
 */
export default function WizardDocumentsPage() {
  const operatorId = useOperatorId()
  const router = useRouter()
  const hydrated = useHydrated()

  const store = useMemo(() => createWizardStore(operatorId, NEW_CHATBOT_ID), [operatorId])

  const [chatbotId, setChatbotId] = useState<string | null>(null)
  const [ensureError, setEnsureError] = useState<string | null>(null)

  // Guard + draft-chatbot wiring, both after hydration.
  useEffect(() => {
    if (!hydrated) return
    const name = store.getState().name.trim()
    if (!name) {
      router.replace('/board/wizard')
      return
    }
    let cancelled = false
    ensureDraftChatbot(operatorId, name)
      .then((id) => {
        if (cancelled) return
        setChatbotId(id)
        setEnsureError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setEnsureError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
      })
    return () => {
      cancelled = true
    }
  }, [hydrated, operatorId, router, store])

  const documents = store((state) => state.documents)

  return (
    <div className="flex flex-1 flex-col" data-testid="wizard-documents">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-ink">Wire in documents</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-ink/70">
        The line answers from these documents. Add the ones your customers ask about — prices,
        menus, policies.
      </p>

      <div className="mt-8">
        {chatbotId ? (
          <FileDropzone
            chatbotId={chatbotId}
            onUploaded={(document) => store.getState().addDocument(document)}
          />
        ) : ensureError ? (
          <div className="flex flex-col gap-3 rounded-card border border-hairline-slate bg-panel-warm p-6">
            <p role="alert" className="text-sm text-slate-ink">
              {ensureError}
            </p>
            <button
              type="button"
              onClick={() => {
                setEnsureError(null)
                router.refresh()
              }}
              className="self-start rounded-plate border border-hairline-slate bg-panel-warm px-4 py-2 font-mono text-xs font-medium uppercase tracking-plate text-slate-ink hover:bg-well-warm"
            >
              Try again
            </button>
          </div>
        ) : (
          <p className="font-mono text-xs uppercase tracking-plate text-slate-ink/70">
            Wiring the line…
          </p>
        )}
      </div>

      {/* Store-derived UI renders only after hydration (DC-007-5): the
          persisted draft exists only on the client. */}
      {hydrated && documents.length > 0 && (
        <ul data-testid="wizard-document-list" className="mt-6 flex flex-col gap-2">
          {documents.map((document) => (
            <li
              key={document.id}
              data-testid="wizard-document-row"
              className="flex items-center gap-4 rounded-plate border border-hairline-slate bg-panel-warm px-4 py-3"
            >
              <span className="min-w-0 truncate font-mono text-sm text-slate-ink">
                {document.fileName}
              </span>
              <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-slate-ink/60">
                {Math.max(1, Math.round(document.fileSize / 1024))} KB
              </span>
              <button
                type="button"
                data-testid={`wizard-document-remove-${document.id}`}
                onClick={() => store.getState().removeDocument(document.id)}
                className="shrink-0 rounded-plate border border-hairline-slate bg-panel-warm px-3 py-1.5 font-mono text-xs uppercase tracking-plate text-slate-ink hover:bg-well-warm"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-center justify-between pt-6">
        <Link
          href="/board/wizard"
          className="font-mono text-xs uppercase tracking-plate text-slate-ink hover:text-slate-ink/70"
        >
          Back
        </Link>
        <button
          type="button"
          data-testid="wizard-continue"
          disabled={!hydrated || !chatbotId}
          onClick={() => {
            store.getState().goToStep('review')
            router.push('/board/wizard/review')
          }}
          className="rounded-plug bg-slate-ink px-6 py-2.5 font-mono text-xs font-semibold uppercase tracking-plate text-operators-ivory hover:bg-slate-ink/90 disabled:opacity-60"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
