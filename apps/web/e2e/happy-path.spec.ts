import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type BrowserContext } from '@playwright/test'

/**
 * WI-007 Task 17 — the operator's happy path, fully local:
 *
 * forged cookies → /board → plug in a new line → wizard (name → upload →
 * review + plan → publish) → the jack goes live (asserted on the
 * `wizard-plugged` state, never on navigation timing) → lands on the
 * detail page with the line live.
 *
 * The publish mutation is verified end-to-end through the mock backend's
 * request log: the CSRF header must survive the BFF proxy, and the
 * Bearer token must have been attached server-side.
 *
 * The captures at the top feed the Impeccable finish review (T-18):
 * settled desktop + mobile shots of the seeded board.
 */

const JWKS_ORIGIN = 'http://127.0.0.1:4312'
const API_ORIGIN = 'http://127.0.0.1:4311'
// Playwright runs with the config's directory as cwd (apps/web).
const REVIEW_DIR = path.join(process.cwd(), '.impeccable', 'review')

/** Settled means: rows rendered and the post-render dust has settled. */
const SETTLE_MS = 700

async function signInWithForgedCookies(context: BrowserContext): Promise<void> {
  const response = await fetch(`${JWKS_ORIGIN}/_tokens`, { method: 'POST' })
  if (!response.ok) throw new Error(`Token minting failed: ${response.status}`)
  const tokens = (await response.json()) as { access_token: string; id_token: string }
  const expires = Date.now() / 1000 + 3600
  await context.addCookies([
    {
      name: 'access_token',
      value: tokens.access_token,
      url: 'http://127.0.0.1:4310',
      httpOnly: true,
      sameSite: 'Lax',
      expires,
    },
    {
      name: 'id_token',
      value: tokens.id_token,
      url: 'http://127.0.0.1:4310',
      httpOnly: true,
      sameSite: 'Lax',
      expires,
    },
  ])
}

test.beforeEach(async ({ context }) => {
  await signInWithForgedCookies(context)
})

test('operator plugs in a new line end to end', async ({ page }) => {
  // --- Impeccable capture round: the seeded board, settled, both sizes. ---
  mkdirSync(REVIEW_DIR, { recursive: true })
  console.log(`[captures] writing to ${REVIEW_DIR}`)

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/board')
  await expect(page.getByTestId('board-line-link')).toHaveCount(2)
  await expect(page.getByTestId('usage-slot')).toBeVisible()
  await page.waitForTimeout(SETTLE_MS)
  await page.screenshot({ path: path.join(REVIEW_DIR, "desktop.png") })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/board')
  await expect(page.getByTestId('board-line-link')).toHaveCount(2)
  await page.waitForTimeout(SETTLE_MS)
  await page.screenshot({ path: path.join(REVIEW_DIR, "mobile.png") })

  await page.setViewportSize({ width: 1440, height: 900 })

  // --- The happy path. ---
  await page.goto('/board')
  await page.getByTestId('plug-new-line').click()
  await expect(page).toHaveURL(/\/board\/wizard$/)

  // Step 1 — name the line.
  await page.getByTestId('wizard-name-input').fill('Harbor Café')
  await page.getByTestId('wizard-continue').click()

  // Step 2 — wire in documents (the mock accepts a small text file).
  const dropzone = page.getByTestId('file-dropzone')
  await expect(dropzone).toBeVisible()
  await dropzone.locator('input[type="file"]').setInputFiles({
    name: 'menu.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Flat white — 4.50\nCortado — 4.00\nCold brew — 5.00\n'),
  })
  await expect(page.getByTestId('wizard-document-row')).toHaveCount(1)
  await expect(page.getByTestId('wizard-document-row')).toContainText('menu.txt')

  await page.getByTestId('wizard-continue').click()

  // Step 3 — review: readiness comes from the API (the mock simulates
  // finished processing) and the plan rides the reconciled wire shape.
  await expect(page.getByTestId('wizard-review')).toBeVisible()
  await expect(page.getByTestId('wizard-readiness')).toContainText('1 of 1 documents ready')
  const planOption = page.getByTestId('plan-option-plan-starter')
  await planOption.locator('input[type="radio"]').check()
  await expect(planOption).toContainText('$19.00/mo')

  await page.getByTestId('wizard-continue').click()

  // Step 4 — the plug-in moment. Readiness is already resolved, so no
  // confirmation dialog appears (DC-007-2 covers the zero-ready gate).
  await expect(page.getByTestId('wizard-publish')).toBeVisible()
  await expect(page.getByTestId('publish-summary-docs')).toContainText('1 ready')
  await expect(page.getByTestId('publish-summary-plan')).toContainText('Starter')

  await page.getByTestId('wizard-plug').click()

  // The jack goes live — asserted on the wizard-plugged state, not on
  // navigation timing (the landing beat is 1200 ms later).
  const plugged = page.getByTestId('wizard-plugged')
  await expect(plugged).toBeVisible()
  const pluggedJack = plugged.locator('[data-testid="jack-card"]')
  await expect(pluggedJack).toHaveAttribute('data-line-state', 'live')
  await expect(pluggedJack.locator('[data-testid="jack-body"]')).toHaveClass(/bg-patch-amber/)

  // The draft is spent and the operator lands on the detail page.
  await page.waitForURL(/\/board\/chatbots\/[^/]+$/, { timeout: 10_000 })
  const detailJack = page.getByTestId('chatbot-detail-header').getByTestId('jack-card')
  await expect(detailJack).toHaveAttribute('data-line-state', 'live')
  await expect(page.getByTestId('embed-snippet')).toBeVisible()

  // The board shows the new live line among the seeded ones.
  await page.goto('/board')
  await expect(page.getByTestId('board-line-link')).toHaveCount(3)

  // The publish mutation crossed the BFF proxy with the CSRF header and
  // the server-side Bearer token attached.
  const log = await fetch(`${API_ORIGIN}/api/_requests`).then((res) => res.json() as Promise<{
    requests: Array<{ method: string; path: string; xRequestedWith: string | null; hasAuthorization: boolean }>
  }>)
  const publish = log.requests.find(
    (entry) => entry.method === 'POST' && /\/chatbots\/[^/]+\/publish$/.test(entry.path),
  )
  expect(publish, 'publish request should have reached the mock backend').toBeTruthy()
  expect(publish!.xRequestedWith).toBe('XMLHttpRequest')
  expect(publish!.hasAuthorization).toBe(true)

  const upload = log.requests.find(
    (entry) => entry.method === 'POST' && /\/chatbots\/[^/]+\/documents$/.test(entry.path),
  )
  expect(upload, 'upload request should have reached the mock backend').toBeTruthy()
  expect(upload!.xRequestedWith).toBe('XMLHttpRequest')
  expect(upload!.hasAuthorization).toBe(true)
})
