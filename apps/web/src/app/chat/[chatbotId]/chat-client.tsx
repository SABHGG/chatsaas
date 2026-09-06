'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  PUBLIC_CHAT_RETRY_DELAY_MS,
  PublicChatError,
  visitorCopyFor,
  sendPublicChatMessage,
  type ChatSource,
  type VisitorErrorKind,
} from '@/lib/chat-public'

/**
 * The visitor chat island (WI-009 T-03) — an "Ask-First Q&A Board".
 *
 * The visitor came for an answer, not a chat: the composer leads, and
 * every answered question becomes a small document card beneath it —
 * question as heading, grounded answer as body, sources footnoted to the
 * same card behind a collapsed disclosure. The newest card carries the
 * thinking state while the round-trip runs (it can take seconds, R-4).
 *
 * Hard rules baked in here:
 * - Messages and sources render as plain text ONLY — no dangerouslySetInnerHTML
 *   anywhere in this surface; source chunks and answers are untrusted text
 *   and must render inert (R-1).
 * - conversation_id lives in a ref, in memory only. It never touches
 *   localStorage/sessionStorage so a shared device never resumes a
 *   stranger's thread (R-5).
 * - Transient failures retry once automatically, then offer a manual retry;
 *   no question is silently dropped (AC 3).
 */

/** Sources are footnotes, not a data dump — cap what a card shows. */
const MAX_SOURCES_SHOWN = 3

interface Turn {
  id: string
  question: string
  status: 'thinking' | 'answered' | 'error'
  answer?: string
  sources?: ChatSource[]
  error?: VisitorErrorKind
  /** Set once the one automatic retry (R-4) has been spent on this turn. */
  autoRetryUsed: boolean
}

export interface ChatClientProps {
  /** The chatbot's public name (R-7: the only public field). */
  name: string
  chatbotId: string
  /** Override the API base (tests). */
  baseUrl?: string
}

export function ChatClient({ name, chatbotId, baseUrl }: ChatClientProps) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const conversationIdRef = useRef<string | null>(null)
  const retryTimerRef = useRef<number | null>(null)
  const retryButtonRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const boardEndRef = useRef<HTMLDivElement | null>(null)
  const hadPendingRef = useRef(false)
  const turnCounterRef = useRef(0)

  const pending = turns.some((turn) => turn.status === 'thinking')

  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current)
    }
  }, [])

  // Focus management: when a turn settles, the composer gets focus back —
  // unless the turn failed, in which case its retry action gets it.
  useEffect(() => {
    const hasPending = turns.some((turn) => turn.status === 'thinking')
    if (hadPendingRef.current && !hasPending) {
      const last = turns[turns.length - 1]
      if (last?.status === 'error') retryButtonRef.current?.focus()
      else inputRef.current?.focus()
    }
    hadPendingRef.current = hasPending
  }, [turns])

  // Keep the newest card in view as the document grows.
  useEffect(() => {
    if (turns.length === 0) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    boardEndRef.current?.scrollIntoView({
      block: 'end',
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }, [turns])

  async function ask(question: string, turnId: string, allowAutoRetry: boolean) {
    try {
      const result = await sendPublicChatMessage(
        chatbotId,
        { message: question, conversationId: conversationIdRef.current ?? undefined },
        { baseUrl },
      )
      // Opaque token from the API — kept in memory only (R-5).
      conversationIdRef.current = result.conversationId
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                status: 'answered',
                answer: result.answer,
                sources: result.sources.slice(0, MAX_SOURCES_SHOWN),
              }
            : turn,
        ),
      )
    } catch (err) {
      const kind: VisitorErrorKind = err instanceof PublicChatError ? err.kind : 'unavailable'
      const transient = err instanceof PublicChatError ? err.transient : true
      if (transient && allowAutoRetry) {
        // One quiet automatic retry while the card keeps thinking (R-4).
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === turnId ? { ...turn, autoRetryUsed: true } : turn,
          ),
        )
        retryTimerRef.current = window.setTimeout(() => {
          void ask(question, turnId, false)
        }, PUBLIC_CHAT_RETRY_DELAY_MS)
        return
      }
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === turnId ? { ...turn, status: 'error', error: kind } : turn,
        ),
      )
    }
  }

  /** One submit path shared by the Ask button and Enter (Shift+Enter = newline). */
  function submitDraft(event?: FormEvent | KeyboardEvent) {
    event?.preventDefault()
    const question = draft.trim()
    if (!question || pending) return
    turnCounterRef.current += 1
    const turnId = `turn-${turnCounterRef.current}`
    setDraft('')
    setTurns((prev) => [
      ...prev,
      { id: turnId, question, status: 'thinking', autoRetryUsed: false },
    ])
    void ask(question, turnId, true)
  }

  function handleRetry(turnId: string, question: string) {
    if (pending) return
    setTurns((prev) =>
      prev.map((turn) =>
        turn.id === turnId ? { ...turn, status: 'thinking', error: undefined } : turn,
      ),
    )
    void ask(question, turnId, false) // the automatic retry is already spent
  }

  return (
    <>
      <header className="vchat-header">
        <h1 className="vchat-name">{name}</h1>
        <p className="vchat-note">Answers from company documents.</p>
      </header>

      <div className="vchat-composer">
        <form onSubmit={(event) => submitDraft(event)} aria-busy={pending}>
          <label htmlFor="vchat-input" className="sr-only">
            Ask a question
          </label>
          <textarea
            id="vchat-input"
            className="vchat-input"
            data-testid="visitor-composer"
            rows={1}
            value={draft}
            placeholder="Type your question…"
            maxLength={2000}
            disabled={pending}
            onChange={(event) => {
              setDraft(event.target.value)
              const el = event.target
              if (el instanceof HTMLTextAreaElement && el.scrollHeight > 0) {
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) submitDraft(event)
            }}
          />
          <button
            type="submit"
            className="vchat-send"
            data-testid="visitor-send"
            disabled={pending || draft.trim().length === 0}
          >
            Ask
          </button>
        </form>
      </div>

      <div className="vchat-board">
        {turns.length === 0 && (
          <p className="vchat-greeting" data-testid="visitor-greeting">
            Hi! Ask anything about {name}.
          </p>
        )}

        <ol className="vchat-list" role="log" aria-label={`Answered questions about ${name}`}>
          {turns.map((turn) => (
            <li key={turn.id} className="vchat-item" data-testid="visitor-card">
              <h2 className="vchat-question">{turn.question}</h2>

              {turn.status === 'thinking' && (
                <p className="vchat-thinking" role="status">
                  <span className="vchat-dots" aria-hidden="true">
                    <span className="vchat-dot" />
                    <span className="vchat-dot" />
                    <span className="vchat-dot" />
                  </span>
                  Thinking…
                </p>
              )}

              {turn.status === 'answered' && (
                <div className="vchat-reveal">
                  <p className="vchat-answer" data-testid="visitor-answer">
                    {turn.answer}
                  </p>
                </div>
              )}

              {turn.status === 'error' && turn.error && (
                <>
                  <p className="vchat-error" role="alert">
                    {visitorCopyFor(turn.error)}
                  </p>
                  {turn.error !== 'plan-limit' && (
                    <button
                      type="button"
                      className="vchat-retry"
                      data-testid="visitor-retry"
                      ref={retryButtonRef}
                      disabled={pending}
                      onClick={() => handleRetry(turn.id, turn.question)}
                    >
                      Try again
                    </button>
                  )}
                </>
              )}

              {turn.status === 'answered' && turn.sources && turn.sources.length > 0 && (
                <details className="vchat-sources" data-testid="visitor-sources">
                  <summary data-testid="visitor-sources-toggle">
                    Sources ({turn.sources.length})
                    <ChevronDown className="vchat-chevron" size={14} aria-hidden="true" />
                  </summary>
                  <ul className="vchat-source-list">
                    {turn.sources.map((source: ChatSource) => (
                      <li key={source.id}>{source.content}</li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ol>
        <div ref={boardEndRef} aria-hidden="true" />
      </div>
    </>
  )
}
