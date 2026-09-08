// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createWizardStore, NEW_CHATBOT_ID, wizardDraftKey } from './wizard-store'

/**
 * WI-007 Task 9 (R-3): a full reload between EVERY step must restore
 * the draft. Creating a fresh store instance re-reads persisted state
 * from localStorage — exactly what a browser reload does.
 */
const OPERATOR_ID = 'op-1'
const CHATBOT_ID = NEW_CHATBOT_ID

const DOC_PRICE_LIST = {
  id: 'doc-1',
  fileName: 'price-list.pdf',
  fileSize: 2048,
  contentType: 'application/pdf',
  status: 'uploaded',
}
const DOC_MENU = {
  id: 'doc-2',
  fileName: 'menu.md',
  fileSize: 512,
  contentType: 'text/markdown',
  status: 'uploaded',
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('wizardDraftKey', () => {
  it('builds the chatsaas:draft:<operatorId>:<chatbotId> key', () => {
    expect(wizardDraftKey('op-1', 'new')).toBe('chatsaas:draft:op-1:new')
    expect(wizardDraftKey('acme', 'bot-42')).toBe('chatsaas:draft:acme:bot-42')
  })
})

describe('wizard draft survives a full reload between every step', () => {
  it('restores step 1 (name) after a reload', () => {
    let store = createWizardStore(OPERATOR_ID, CHATBOT_ID)
    store.getState().setName('Front Desk')

    store = createWizardStore(OPERATOR_ID, CHATBOT_ID) // full reload
    expect(store.getState().name).toBe('Front Desk')
  })

  it('restores step 2 (documents) after a reload, including removals', () => {
    let store = createWizardStore(OPERATOR_ID, CHATBOT_ID)
    store.getState().setName('Front Desk')
    store.getState().addDocument(DOC_PRICE_LIST)

    store = createWizardStore(OPERATOR_ID, CHATBOT_ID) // full reload
    expect(store.getState().name).toBe('Front Desk')
    expect(store.getState().documents).toEqual([DOC_PRICE_LIST])

    store.getState().addDocument(DOC_MENU)
    store = createWizardStore(OPERATOR_ID, CHATBOT_ID) // full reload
    expect(store.getState().documents).toEqual([DOC_PRICE_LIST, DOC_MENU])

    store.getState().removeDocument('doc-1')
    store = createWizardStore(OPERATOR_ID, CHATBOT_ID) // full reload
    expect(store.getState().documents).toEqual([DOC_MENU])
  })

  it('restores step 3 (review) after a reload', () => {
    let store = createWizardStore(OPERATOR_ID, CHATBOT_ID)
    store.getState().goToStep('review')

    store = createWizardStore(OPERATOR_ID, CHATBOT_ID) // full reload
    expect(store.getState().step).toBe('review')
  })

  it('restores step 4 (publish) after a reload', () => {
    let store = createWizardStore(OPERATOR_ID, CHATBOT_ID)
    store.getState().goToStep('publish')

    store = createWizardStore(OPERATOR_ID, CHATBOT_ID) // full reload
    expect(store.getState().step).toBe('publish')
  })

  it('starts at the default step when nothing was persisted', () => {
    const store = createWizardStore(OPERATOR_ID, CHATBOT_ID)
    expect(store.getState().step).toBe('name')
    expect(store.getState().name).toBe('')
    expect(store.getState().documents).toEqual([])
  })

  it('reset clears the draft across a reload', () => {
    let store = createWizardStore(OPERATOR_ID, CHATBOT_ID)
    store.getState().setName('Front Desk')
    store.getState().addDocument(DOC_PRICE_LIST)
    store.getState().goToStep('review')

    store.getState().reset()
    store = createWizardStore(OPERATOR_ID, CHATBOT_ID) // full reload
    expect(store.getState().step).toBe('name')
    expect(store.getState().name).toBe('')
    expect(store.getState().documents).toEqual([])
  })

  it('keeps drafts separate per operator and chatbot', () => {
    const mine = createWizardStore('op-1', 'new')
    const theirs = createWizardStore('op-2', 'new')

    mine.getState().setName('Front Desk')
    theirs.getState().setName('La esquina')

    expect(createWizardStore('op-1', 'new').getState().name).toBe('Front Desk')
    expect(createWizardStore('op-2', 'new').getState().name).toBe('La esquina')
  })

  it('writes the persisted payload under the draft key', () => {
    const store = createWizardStore(OPERATOR_ID, CHATBOT_ID)
    store.getState().setName('Front Desk')

    const raw = window.localStorage.getItem(wizardDraftKey(OPERATOR_ID, CHATBOT_ID))
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!)).toMatchObject({
      state: { name: 'Front Desk', step: 'name', documents: [] },
      version: 1,
    })
  })
})
