import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * SANDBOX web e2e — the REAL browser flow (run via playwright.sandbox.config.ts):
 *
 *   real OAuth2 code+PKCE login against the fake Cognito
 *   (e2e/fixtures/fake-cognito.mts, HTTPS + self-signed cert)
 *     → board renders the seeded sandbox data (the Index Rail)
 *     → wizard: name → real upload through the BFF → REAL manual ingest
 *       (apps/functions/scripts/sandbox-ingest-bot.mjs against floci) →
 *       review (readiness + plan) → publish
 *     → the line lands LIVE in the board's detail pane (the old detail
 *       route redirects into ?line=<id>) with the iframe snippet
 *     → the board's index card shows the new line's lamp as Live.
 *
 * This hits the REAL sandbox API on 127.0.0.1:3001 (floci + mock Bedrock +
 * pgvector) — grounding/answers are proven at the API level, so this spec
 * never asserts on mock answer text.
 *
 * Data note: every run creates a NEW 'Browser Flow Line' bot on the real
 * sandbox API. Assertions therefore target THIS run's bot by its id
 * (chatbot ref read from sessionStorage) and never assert absolute board
 * counts.
 *
 * The captures at the top feed the Impeccable finish review: settled
 * desktop + mobile shots of the seeded board with a line selected.
 */

const FLOW_LINE_NAME = 'Browser Flow Line'
const UPLOAD_FILE_NAME = 'browser-flow-secret.txt'
const UPLOAD_FILE_CONTENT = 'The sandbox browser flow secret phrase is MARACUYA-9911.'
const PLAN_NAME = 'Sandbox Starter'

/** Playwright runs with the config's directory as cwd (apps/web). */
const FUNCTIONS_DIR = path.resolve(process.cwd(), '..', 'functions')
const REVIEW_DIR = path.join(process.cwd(), '.impeccable', 'review')

/** Settled means: rows rendered and the post-render dust has settled. */
const SETTLE_MS = 700

test('sandbox: real OAuth login, wizard, manual ingest, publish → live line', async ({ page }) => {
  // --- Gate: middleware bounces the anonymous operator to /login. ---
  await page.goto('/board')
  await expect(page).toHaveURL(/\/login\?next=%2Fboard$/, { timeout: 30_000 })

  // --- The REAL roundtrip: /api/auth/login → 302 fake /oauth2/authorize
  // (auto-approve, echoed state) → 302 /api/auth/callback → code+PKCE
  // token exchange (server-side fetch, NODE_EXTRA_CA_CERTS) → /board,
  // where the middleware verifies the access token against the fake
  // IdP's JWKS. ---
  await page.getByRole('link', { name: 'Sign in' }).click()
  await page.waitForURL(/\/board$/, { timeout: 60_000 })
  await expect(page.getByRole('heading', { name: 'Your lines' })).toBeVisible()
  await expect(
    page.getByTestId('board-line-link').filter({ hasText: 'Flow Test Line' }).first(),
  ).toBeVisible()

  // --- Finish-evidence captures: the new Index Rail board, settled,
  // with a seeded line selected so the detail pane is open. ---
  mkdirSync(REVIEW_DIR, { recursive: true })
  console.log(`[captures] writing to ${REVIEW_DIR}`)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByTestId('board-line-link').first().click()
  await expect(page.getByTestId('chatbot-detail-header')).toBeVisible()
  await page.waitForTimeout(SETTLE_MS)
  await page.screenshot({ path: path.join(REVIEW_DIR, 'desktop.png') })

  await page.setViewportSize({ width: 390, height: 844 })
  // Mobile capture: a FRESH page load with the selection carried by the
  // URL, never a tap — a tap's touch-hover freezes a hover ground on
  // the strip cards (seen on the prior run), and a fresh load carries
  // no such residue. The href is read, not clicked.
  const mobileHref =
    (await page.locator('[data-testid="board-line-link"]').first().getAttribute('href')) ?? '/board'
  await page.goto(mobileHref)
  await expect(page.getByTestId('chatbot-detail-header')).toBeVisible()
  await page.waitForTimeout(SETTLE_MS)
  await page.screenshot({ path: path.join(REVIEW_DIR, 'mobile.png') })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/board')

  // --- Step 1 — name the line (Continue CREATES the draft bot via the
  // BFF proxy → real API). ---
  await page.getByTestId('plug-new-line').click()
  await expect(page).toHaveURL(/\/board\/wizard$/)
  await expect(page.getByTestId('wizard-name')).toBeVisible()
  await page.getByTestId('wizard-name-input').fill(FLOW_LINE_NAME)
  await page.getByTestId('wizard-continue').click()
  await expect(page).toHaveURL(/\/board\/wizard\/documents$/)

  // --- Step 2 — wire in a document through the REAL dropzone + BFF proxy
  // (XHR upload, raw bytes to the sandbox API). ---
  const dropzone = page.getByTestId('file-dropzone')
  await expect(dropzone).toBeVisible()
  await dropzone.locator('input[type="file"]').setInputFiles({
    name: UPLOAD_FILE_NAME,
    mimeType: 'text/plain',
    buffer: Buffer.from(UPLOAD_FILE_CONTENT),
  })
  await expect(page.getByTestId('wizard-document-row')).toHaveCount(1)
  await expect(page.getByTestId('wizard-document-row')).toContainText(UPLOAD_FILE_NAME)

  // The draft's server-side ref (written at step 1) names the bot this
  // run owns — the ingest sweep and the board assertions key off it.
  const chatbotId = await page.evaluate(() => {
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index)
      if (key && key.startsWith('chatsaas:wizard-ref:') && key.endsWith(':chatbot-id')) {
        return sessionStorage.getItem(key)
      }
    }
    return null
  })
  expect(chatbotId, 'the wizard should have minted the draft chatbot on the API').toBeTruthy()

  // --- REAL manual ingest: production ingest is an EventBridge Lambda
  // floci does not wire, so the spec triggers the REAL ingest handler for
  // this bot's uploaded documents (floci DynamoDB + S3 + mock Bedrock +
  // pgvector). ---
  const ingest = execSync(
    `pnpm exec tsx --env-file-if-exists=.env scripts/sandbox-ingest-bot.mjs ${chatbotId}`,
    {
      cwd: FUNCTIONS_DIR,
      env: { ...process.env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 90_000,
    },
  )
  console.log(`[sandbox-ingest-bot] ${ingest.trim()}`)

  // --- Step 3 — review: readiness is read straight from the real API
  // (ingested documents are ready) and the seeded plan is pickable. ---
  await page.getByTestId('wizard-continue').click()
  await expect(page).toHaveURL(/\/board\/wizard\/review$/)
  await expect(page.getByTestId('wizard-review')).toBeVisible()
  await expect(page.getByTestId('wizard-readiness')).toContainText('1 of 1 documents ready')

  const planOption = page.locator('[data-testid^="plan-option-"]').filter({ hasText: PLAN_NAME })
  await expect(planOption).toBeVisible()
  await planOption.locator('input[type="radio"]').check()
  await page.getByTestId('wizard-continue').click()

  // --- Step 4 — the plug-in moment. ≥1 ready doc, so NO confirmation
  // dialog appears (DC-007-2 gates only the zero-ready publish). ---
  await expect(page).toHaveURL(/\/board\/wizard\/publish$/)
  await expect(page.getByTestId('wizard-publish')).toBeVisible()
  await expect(page.getByTestId('publish-summary-docs')).toContainText('1 ready')
  await expect(page.getByTestId('publish-summary-plan')).toContainText(PLAN_NAME)

  await page.getByTestId('wizard-plug').click()

  // The lit-jack beat: asserted on the wizard-plugged marker, never on
  // navigation timing (the landing beat is 1200 ms later).
  const plugged = page.getByTestId('wizard-plugged')
  await expect(plugged).toBeVisible()
  const pluggedJack = plugged.locator('[data-testid="jack-card"]')
  await expect(pluggedJack).toHaveAttribute('data-line-state', 'live')
  await expect(pluggedJack.locator('[data-testid="jack-body"]')).toHaveClass(/bg-patch-amber/)

  // Landed on the board with the new line selected: the old detail route
  // redirects into ?line=<id>, where the detail pane opens beside the
  // index — live jack, live controls, iframe snippet, documents.
  await page.waitForURL(new RegExp(`/board\\?line=${chatbotId}$`), { timeout: 30_000 })
  const detailJack = page.getByTestId('chatbot-detail-header').getByTestId('jack-card')
  await expect(detailJack).toHaveAttribute('data-line-state', 'live')
  await expect(page.getByTestId('unplug-open')).toBeVisible()
  await expect(page.getByTestId('embed-snippet')).toBeVisible()
  await expect(page.getByTestId('embed-snippet-text')).toContainText('<iframe')
  await expect(page.getByTestId('detail-document-row')).toContainText(UPLOAD_FILE_NAME)
  await expect(page.getByTestId('detail-document-row')).toContainText('Ready')

  // Back on the board's glance, THIS run's index card shows the Live lamp.
  await page.goto('/board')
  const newLine = page.locator(`a[data-testid="board-line-link"][href="/board?line=${chatbotId}"]`)
  await expect(newLine).toBeVisible()
  await expect(newLine).toHaveAttribute('data-line-state', 'live')
  await expect(newLine.getByTestId('rail-lamp')).toHaveClass(/bg-patch-amber/)
})
