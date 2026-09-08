import { z } from 'zod'
import type { LineState } from '@/components/line-state-pill'

/**
 * Zod schemas for the admin API contract. Each schema validates the
 * envelope's `data` field for one endpoint; `lib/api-client.ts` applies
 * them and surfaces parse failures as operator-language errors.
 *
 * CONTRACT RECONCILIATION (WI-007 Batch D, Task 0): schemas describe the
 * OBSERVED backend reality in apps/functions/src — the authoritative
 * implementation — because knowledge/tech/api-spec.md has drifted from it.
 * Divergences absorbed here (reported to the API owner):
 *  - documents ride camelCase (`filename`, `mimeType`, `byteCount`) and
 *    the list response wraps them: `{ documents: [...] }`
 *  - upload answers `{ documentId, status, s3Key, companyId, chatbotId }`
 *    (raw-body transport with `x-filename` / `x-mime-type` headers, not
 *    multipart — see lib/upload.ts)
 *  - plans are `{ id, name, description, price (dollars), interval }`
 *    with NO status field: active filtering happens server-side
 *  - error bodies are `{ success: false, error, code }` (lib/api-errors.ts)
 */

/** Chatbot list item — `GET /api/chatbots` (api-spec.md). */
export const chatbotListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  // draft | published | archived — kept open-ended per api-errors discipline.
  status: z.string(),
  document_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  published_at: z.string().nullable(),
})
export type ChatbotListItem = z.infer<typeof chatbotListItemSchema>

export const chatbotListSchema = z.array(chatbotListItemSchema)

/** Published list item — `GET /api/chatbots/published` (202 section). */
export const publishedListItemSchema = chatbotListItemSchema.extend({
  url: z.string(),
  iframe_src: z.string(),
})
export const publishedListSchema = z.array(publishedListItemSchema)
export type PublishedListItem = z.infer<typeof publishedListItemSchema>

/** Response of `POST /api/chatbots/:chatbotId/publish` (202). */
export const publishResponseSchema = z.object({
  status: z.string(),
  url: z.string(),
  iframe_src: z.string(),
  expires_at: z.string().nullable(),
})
export type PublishResponse = z.infer<typeof publishResponseSchema>

/**
 * Document object as the backend actually returns it (apps/functions
 * DocumentRecord — documentsList.ts / documentsUpload.ts storage shape):
 * camelCase `filename` / `mimeType` / `byteCount`. Status values ride the
 * wire open-ended; the ingest pipeline uses uploaded / processing /
 * ready / failed.
 */
export const documentRecordSchema = z.object({
  id: z.string(),
  chatbotId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  byteCount: z.number(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type DocumentRecord = z.infer<typeof documentRecordSchema>

/**
 * `GET /api/chatbots/:chatbotId/documents` — the backend wraps the array:
 * `{ success: true, data: { documents: [...] } }`.
 */
export const documentListSchema = z.object({
  documents: z.array(documentRecordSchema),
})

/** `GET /api/credits/balance`. */
export const creditBalanceSchema = z.object({ balance: z.number() })
export type CreditBalance = z.infer<typeof creditBalanceSchema>

/**
 * Plan from `GET /api/plans/available` — the backend's wire shape
 * (plansAvailable.ts): price is DOLLARS (e.g. 9.99), not cents, and
 * there is no `status` field — the handler already filters to active
 * plans server-side.
 */
export const planSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  price: z.number(),
  interval: z.string(),
})
export type Plan = z.infer<typeof planSchema>

export const planListSchema = z.array(planSchema)

/** Operator-facing price label from the backend's dollars + interval. */
export function planPriceLabel(plan: Plan): string {
  return `$${plan.price.toFixed(2)}${plan.interval === 'yearly' ? '/yr' : '/mo'}`
}

/**
 * Map an API chatbot status onto the line vocabulary (ADR-007).
 * draft → unplugged, published → live. `connecting` is reserved for the
 * in-flight publish transition (the cord is being plugged in); `on hold`
 * is the 429 surface, never a per-bot status.
 */
export function lineStateFromStatus(status: string): LineState {
  switch (status) {
    case 'published':
      return 'live'
    default:
      // Draft (archived bots are filtered out of every list by the API).
      return 'unplugged'
  }
}
