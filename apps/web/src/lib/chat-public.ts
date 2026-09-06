import { z } from 'zod'

/**
 * WI-009 T-01 — typed client for the two PUBLIC chat endpoints
 * (WI-002 chatbotsPublic + WI-006 chatPublicMessage).
 *
 * This is the VISITOR surface: anonymous by design. Unlike the board's
 * `lib/api-client.ts` it never sends cookies (`credentials: 'omit'`), a
 * Bearer token, or the BFF CSRF header — there is no operator session
 * here and the public routes authenticate nobody. It calls the API base
 * directly (NEXT_PUBLIC_API_URL), not the same-origin proxy: the proxy
 * exists to attach the operator's Bearer token, which must never ride
 * along on the visitor surface.
 *
 * Contract pins (verified against apps/functions/src):
 * - GET  /api/public/chatbots/:chatbotId/config
 *        → 200 { success: true, data: { chatbotId, name, status: 'published', expires_at } }
 *        → 404 for unknown / draft / archived (existence is never leaked).
 * - POST /api/public/chat/:chatbotId/message  { message, conversation_id? }
 *        → 200 { data: { answer, conversation_id, sources: [{ id, content, score }] } }
 *        → 400 validation · 402 limits/credits · 404 unpublished · 429 rate limit · 5xx.
 *
 * R-3: every failure becomes a calm VisitorErrorKind; the visitor copy
 * map below is the ONLY place error language is chosen. Status codes,
 * error classes, and backend strings never reach a visitor.
 */

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api'
).replace(/\/+$/, '')

// ---------------------------------------------------------------------------
// Wire shapes (zod-validated — the visitor page trusts nothing it receives).
// ---------------------------------------------------------------------------

const publicChatbotDataSchema = z.object({
  chatbotId: z.string(),
  name: z.string().min(1),
  status: z.literal('published'),
  expires_at: z.null(),
})

const chatSourceSchema = z.object({
  id: z.string(),
  content: z.string(),
  score: z.number(),
})

const chatMessageResponseSchema = z.object({
  answer: z.string(),
  conversation_id: z.uuid(),
  sources: z.array(chatSourceSchema),
})

export type PublicChatbot = z.infer<typeof publicChatbotDataSchema>
export type ChatSource = z.infer<typeof chatSourceSchema>
export interface ChatMessageResult {
  answer: string
  conversationId: string
  sources: ChatSource[]
}

/** The only state the client keeps (R-5): the API-issued conversation id. */
export interface ChatMessageInput {
  message: string
  conversationId?: string
}

// ---------------------------------------------------------------------------
// Visitor copy — R-3. Calm, honest, blame-free. Never a status code, never
// an error class, never billing/cloud vocabulary, never blame of the company.
// ---------------------------------------------------------------------------

/**
 * The failure kinds the visitor surface can render. `transient` marks the
 * kinds worth an automatic second attempt (network drop, server hiccup);
 * plan-limit and rate-limit are deliberate states, not flukes.
 */
export type VisitorErrorKind = 'unavailable' | 'plan-limit' | 'rate-limit' | 'network'

export const VISITOR_ERROR_COPY: Record<VisitorErrorKind, string> = {
  unavailable: 'This assistant is unavailable right now. Please try again in a moment.',
  'plan-limit': 'This assistant reached its plan limit. Please try again later.',
  'rate-limit': 'Too many messages — try again in a minute.',
  network: 'We couldn\u2019t reach the assistant. Check your connection and try again.',
}

/** Thrown for every failed public chat call; carries ONLY the visitor kind. */
export class PublicChatError extends Error {
  readonly kind: VisitorErrorKind
  /** Whether one automatic retry is worthwhile (network / server hiccups). */
  readonly transient: boolean

  constructor(kind: VisitorErrorKind, transient: boolean) {
    super(VISITOR_ERROR_COPY[kind])
    this.name = 'PublicChatError'
    this.kind = kind
    this.transient = transient
  }
}

/** Visitor-facing copy for a failure kind — the single copy source. */
export function visitorCopyFor(kind: VisitorErrorKind): string {
  return VISITOR_ERROR_COPY[kind]
}

// ---------------------------------------------------------------------------
// Calls. No credentials, no auth headers, no X-Requested-With — the public
// surface is anonymous and never rides the BFF proxy.
// ---------------------------------------------------------------------------

interface CallOptions {
  /** Override the configured API base URL (tests, previews). */
  baseUrl?: string
  signal?: AbortSignal
}

/**
 * GET the public chatbot config. Returns the published chatbot, or `null`
 * for every "not available" case (unknown id, unpublished, unreachable,
 * malformed). The server component renders the same neutral state for all
 * of them — existence of unpublished bots is never leaked (R-6).
 */
export async function fetchPublicChatbot(
  chatbotId: string,
  options: CallOptions = {},
): Promise<PublicChatbot | null> {
  const base = options.baseUrl ?? API_BASE_URL
  let response: Response
  try {
    response = await fetch(`${base}/public/chatbots/${encodeURIComponent(chatbotId)}/config`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      signal: options.signal,
    })
  } catch {
    return null
  }

  if (!response.ok) return null

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return null
  }

  const parsed = z
    .object({ success: z.literal(true), data: publicChatbotDataSchema })
    .safeParse(body)
  return parsed.success ? parsed.data.data : null
}

/**
 * Send one visitor message. Resolves with the grounded answer, the
 * conversation id (opaque — kept in memory only, R-5) and the source
 * chunks (plain text, rendered inert by the chat surface).
 */
export async function sendPublicChatMessage(
  chatbotId: string,
  input: ChatMessageInput,
  options: CallOptions = {},
): Promise<ChatMessageResult> {
  const base = options.baseUrl ?? API_BASE_URL
  let response: Response
  try {
    response = await fetch(`${base}/public/chat/${encodeURIComponent(chatbotId)}/message`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(
        input.conversationId
          ? { message: input.message, conversation_id: input.conversationId }
          : { message: input.message },
      ),
      credentials: 'omit',
      signal: options.signal,
    })
  } catch {
    // fetch rejects on network failure / CORS / offline — the assistant
    // never answered. Transient: one automatic retry is worth it (R-4).
    throw new PublicChatError('network', true)
  }

  if (!response.ok) {
    throw publicChatErrorForStatus(response.status)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new PublicChatError('unavailable', false)
  }

  const parsed = z.object({ data: chatMessageResponseSchema }).safeParse(body)
  if (!parsed.success) {
    throw new PublicChatError('unavailable', false)
  }

  return {
    answer: parsed.data.data.answer,
    conversationId: parsed.data.data.conversation_id,
    sources: parsed.data.data.sources,
  }
}

/**
 * Status → visitor kind. The status code itself is consumed here and is
 * never rendered anywhere: the visitor only ever sees VISITOR_ERROR_COPY.
 */
function publicChatErrorForStatus(status: number): PublicChatError {
  switch (status) {
    case 402:
      // The company's plan/credits ran out — never said that way (R-3).
      return new PublicChatError('plan-limit', false)
    case 429:
      return new PublicChatError('rate-limit', false)
    case 404:
      // Unpublished/unknown mid-conversation: same neutral line.
      return new PublicChatError('unavailable', false)
    default:
      // 400 / 5xx / anything unexpected: the assistant had a hiccup.
      return new PublicChatError('unavailable', true)
  }
}

export const PUBLIC_CHAT_RETRY_DELAY_MS = 600
