import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { WizardStepId } from './stepper'

/**
 * The create-flow draft (WI-007 Task 9): persisted with zustand's
 * persist middleware so a full reload at ANY step restores the draft
 * (R-3: wizard draft loss).
 *
 * Key pattern: `chatsaas:draft:<operatorId>:<chatbotId>`. The operator
 * comes from the session's company claim; `chatbotId` is 'new' until
 * the draft chatbot is created, then its real id. Use
 * {@link createWizardStore} — one store instance per draft key — so two
 * drafts never share state. The factory is the architecture: the key is
 * per-operator, so a module-level singleton would leak drafts across
 * operators in tests and preloads.
 */

/** A document wired into the draft (mirrors the upload API response). */
export interface WizardDocument {
  id: string
  fileName: string
  fileSize: number
  contentType: string
  status: string
}

export interface WizardState {
  step: WizardStepId
  name: string
  documents: WizardDocument[]
  setName: (name: string) => void
  addDocument: (document: WizardDocument) => void
  removeDocument: (id: string) => void
  goToStep: (step: WizardStepId) => void
  reset: () => void
}

/** The persisted localStorage key. Exported for tests and preloads. */
export function wizardDraftKey(operatorId: string, chatbotId: string): string {
  return `chatsaas:draft:${operatorId}:${chatbotId}`
}

/** The id used before the draft chatbot exists on the API. */
export const NEW_CHATBOT_ID = 'new'

const DEFAULTS = {
  step: 'name',
  name: '',
  documents: [],
} as const

/**
 * Minimal Storage shim for the SSR pass, where localStorage does not
 * exist. Reads and writes become no-ops; nothing warns, nothing throws,
 * and the store still works (it just never persists).
 */
const SSR_NOOP_STORAGE: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
}

/**
 * Create a fresh wizard store bound to one draft key. Creating a new
 * instance re-reads persisted state — exactly what a full reload does.
 */
export function createWizardStore(operatorId: string, chatbotId: string) {
  return create<WizardState>()(
    persist(
      (set) => ({
        step: DEFAULTS.step,
        name: DEFAULTS.name,
        documents: [...DEFAULTS.documents],
        setName: (name) => set({ name }),
        addDocument: (document) => set((state) => ({ documents: [...state.documents, document] })),
        removeDocument: (id) => set((state) => ({ documents: state.documents.filter((doc) => doc.id !== id) })),
        goToStep: (step) => set({ step }),
        reset: () => set({ step: DEFAULTS.step, name: DEFAULTS.name, documents: [...DEFAULTS.documents] }),
      }),
      {
        name: wizardDraftKey(operatorId, chatbotId),
        version: 1,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? SSR_NOOP_STORAGE : window.localStorage,
        ),
        // Persist data only — actions are code, not state.
        partialize: (state) => ({ step: state.step, name: state.name, documents: state.documents }),
      },
    ),
  )
}
