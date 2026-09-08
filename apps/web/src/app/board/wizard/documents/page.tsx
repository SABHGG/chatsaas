'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useHydrated } from '@/lib/use-hydrated'
import { ensureDraftChatbot } from '@/lib/wizard-refs'
import { Button } from '@/components/ui/button'
import { NEW_CHATBOT_ID, createWizardStore } from '@/components/wizard-store'
import { useOperatorId } from '@/components/operator-context'
import { FileDropzone } from '@/components/file-dropzone'

/**
 * Step 2 — wire in documents. The dropzone uploads through the BFF
 * proxy with progress; each uploaded document joins the persisted draft
 * and can be removed from the list.
 *
 * Step guard (deviation, recorded): the draft lives in localStorage,
 * which the SERVER cannot read, so the yml's "SSR redirect" is
 * implemented as a post-hydration client redirect — without the name
 * from step 1, the operator is sent back to step 1.
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
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Wire in documents</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
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
          <div className="flex flex-col gap-3 border border-border bg-card p-6 text-card-foreground">
            <p role="alert" className="text-sm text-foreground">
              {ensureError}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEnsureError(null)
                router.refresh()
              }}
              className="self-start"
            >
              Try again
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Wiring the line…
          </p>
        )}
      </div>

      {/* Store-derived UI renders only after hydration: the persisted
          draft exists only on the client. */}
      {hydrated && documents.length > 0 && (
        <ul data-testid="wizard-document-list" className="mt-6 flex flex-col gap-2">
          {documents.map((document) => (
            <li
              key={document.id}
              data-testid="wizard-document-row"
              className="flex items-center gap-4 border border-border bg-card px-4 py-3 text-card-foreground"
            >
              <span className="min-w-0 truncate text-sm">
                {document.fileName}
              </span>
              <span className="readout-mono ml-auto shrink-0 text-xs text-muted-foreground">
                {Math.max(1, Math.round(document.fileSize / 1024))} KB
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid={`wizard-document-remove-${document.id}`}
                onClick={() => store.getState().removeDocument(document.id)}
                className="shrink-0"
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-center justify-between pt-6">
        <Link
          href="/board/wizard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Back
        </Link>
        <Button
          type="button"
          data-testid="wizard-continue"
          disabled={!hydrated || !chatbotId}
          onClick={() => {
            store.getState().goToStep('review')
            router.push('/board/wizard/review')
          }}
        >
          Continue
        </Button>
      </div>
    </div>
  )
}
