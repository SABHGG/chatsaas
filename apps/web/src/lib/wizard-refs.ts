import {
  chatbotListItemSchema,
  chatbotListSchema,
  type ChatbotListItem,
} from './api-schemas'
import { proxyRequest } from './bff-request'

/**
 * Server-side refs for the in-flight wizard draft.
 *
 * The draft itself lives in the zustand persist store
 * (`chatsaas:draft:<operatorId>:<chatbotId>` — lib/wizard-store.ts), but
 * `WizardState` is a Batch A+B artifact with a fixed shape: it cannot
 * hold the two values that only exist OUTSIDE the browser:
 *
 * - the chatbot id minted by `POST /api/chatbots` when the draft leaves
 *   step 1 (documents and publish need it), and
 * - the plan the operator picked at step 3 (publish needs its id).
 *
 * Those refs ride sessionStorage under their own keys so a full reload
 * at any step keeps the wizard wired to the same server-side objects
 * (R-3). sessionStorage — not localStorage — is deliberate: a new tab
 * starts a fresh wizard instead of silently adopting a half-finished
 * draft, and the API row remains the source of truth.
 */

const REF_PREFIX = 'chatsaas:wizard-ref'

function refKey(operatorId: string, ref: 'chatbot-id' | 'plan-id'): string {
  return `${REF_PREFIX}:${operatorId}:${ref}`
}

function readRef(operatorId: string, ref: 'chatbot-id' | 'plan-id'): string | null {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(refKey(operatorId, ref))
}

function writeRef(operatorId: string, ref: 'chatbot-id' | 'plan-id', id: string): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(refKey(operatorId, ref), id)
}

function clearRefs(operatorId: string): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(refKey(operatorId, 'chatbot-id'))
  window.sessionStorage.removeItem(refKey(operatorId, 'plan-id'))
}

export const readChatbotRef = (operatorId: string) => readRef(operatorId, 'chatbot-id')
export const writeChatbotRef = (operatorId: string, id: string) => writeRef(operatorId, 'chatbot-id', id)
export const readPlanRef = (operatorId: string) => readRef(operatorId, 'plan-id')
export const writePlanRef = (operatorId: string, id: string) => writeRef(operatorId, 'plan-id', id)
export const clearWizardRefs = clearRefs

/**
 * Stale-ref guard: verify the cached ref still points at a DRAFT
 * chatbot before the wizard adopts it.
 *
 * A ref can outlive the draft it was minted for — publishing from the
 * detail page spends the line without touching these refs — so a
 * re-entered wizard would otherwise silently wire new documents into
 * an already-published line. The company list is the status oracle
 * (the API has no single-chatbot read, and archived bots are filtered
 * out of it): a ref whose chatbot is missing or no longer a draft is
 * discarded so the wizard proceeds as a fresh draft. An unverifiable
 * ref (network/API failure) is never silently adopted — the error
 * propagates to the caller.
 */
export async function verifyChatbotRef(operatorId: string): Promise<ChatbotListItem | null> {
  const cached = readChatbotRef(operatorId)
  if (!cached) return null

  const fleet = await proxyRequest('/chatbots', { dataSchema: chatbotListSchema })
  const match = fleet.find((bot) => bot.id === cached)
  if (match && match.status === 'draft') return match

  clearRefs(operatorId)
  return null
}

/**
 * Return the chatbot id behind the current draft, creating the draft
 * chatbot on the API the first time it is needed. The draft is created
 * exactly once per wizard run: the id is cached in sessionStorage before
 * the second call can ever reach the API.
 *
 * Adoption is guarded by {@link verifyChatbotRef}: a cached ref is only
 * reused while its chatbot is still a draft; a spent ref is discarded
 * and a fresh draft is minted instead.
 */
export async function ensureDraftChatbot(operatorId: string, name: string): Promise<string> {
  const adoptable = await verifyChatbotRef(operatorId)
  if (adoptable) return adoptable.id

  const created = await proxyRequest('/chatbots', {
    method: 'POST',
    body: { name, description: null },
    dataSchema: chatbotListItemSchema,
  })
  writeChatbotRef(operatorId, created.id)
  return created.id
}
