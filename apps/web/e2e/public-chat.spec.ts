import { expect, test } from '@playwright/test'

/**
 * This sandbox's Chromium HEADLESS SHELL build is missing system libraries
 * (libnspr4 et al); the full Chromium build has them all. The channel is
 * a runtime choice and does not change what the spec asserts.
 */
test.use({ channel: 'chromium' })

/**
 * WI-009 T-07 — the public visitor chat happy path, fully local on the
 * mock path (mirrors happy-path.spec.ts's stack):
 *
 *   127.0.0.1:4311  mock backend API (e2e/fixtures/mock-api.mts)
 *   127.0.0.1:4310  the app (`next dev`)
 *
 * The visitor is ANONYMOUS: no cookies are forged, nothing is signed in.
 * A bot is published through the mock's operator API, the public URL is
 * opened, a question is asked, and the grounded answer + sources render.
 * A second turn must continue the conversation (conversation_id), and the
 * 402 (plan limit) and 429 (rate limit) states render their calm copy.
 *
 * `GET /api/_public-messages` proves what the visitor's browser actually
 * sent: first turn without conversation_id, second turn with the id the
 * first response issued.
 */

const API_ORIGIN = 'http://127.0.0.1:4311'

interface MockChatbot {
  data: { id: string }
}

async function publishBot(name: string): Promise<string> {
  const created = await fetch(`${API_ORIGIN}/api/chatbots`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!created.ok) throw new Error(`mock create failed: ${created.status}`)
  const { data } = (await created.json()) as { data: { id: string } }
  const published = await fetch(`${API_ORIGIN}/api/chatbots/${data.id}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plan_id: 'plan-starter' }),
  })
  if (!published.ok) throw new Error(`mock publish failed: ${published.status}`)
  return data.id
}

test('visitor asks a published bot, reads a grounded answer, and keeps asking', async ({
  page,
}) => {
  const botId = await publishBot('Harbor Café Assistant')

  // The URL publish hands out, opened anonymously — no cookies, no auth.
  await page.setViewportSize({ width: 390, height: 720 }) // mobile-first
  await page.goto(`/chat/${botId}`)

  // Document top: the bot's name from the public GET, the note, the composer.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Harbor Café Assistant')
  await expect(page.getByTestId('visitor-greeting')).toContainText(
    'Hi! Ask anything about Harbor Café Assistant.',
  )

  await page.getByTestId('visitor-composer').fill('How much is a flat white?')
  await page.getByTestId('visitor-send').click()

  // Grounded answer, sources footnoted to the same card.
  const answer = page.getByTestId('visitor-answer')
  await expect(answer).toContainText('flat white')
  const sources = page.getByTestId('visitor-sources')
  await expect(sources.locator('summary')).toContainText('Sources (2)')
  await sources.locator('summary').click()
  await expect(sources).toContainText('Flat white — 4.50')
  await expect(sources).toContainText('Cold brew — 5.00')

  // Second turn continues the conversation.
  await page.getByTestId('visitor-composer').fill('And the cortado?')
  await page.getByTestId('visitor-send').click()
  await expect(page.getByTestId('visitor-answer').nth(1)).toContainText('Continuing our chat')

  // The wire proof: turn 1 carried no conversation_id, turn 2 carried the
  // exact id the first turn issued.
  const log = await fetch(`${API_ORIGIN}/api/_public-messages`).then(
    (res) => res.json() as Promise<{ messages: Array<{ conversation_id: string | null; response_conversation_id: string; chatbotId: string }> }>,
  )
  expect(log.messages).toHaveLength(2)
  expect(log.messages[0]!.conversation_id).toBeNull()
  expect(log.messages[1]!.conversation_id).toBe(log.messages[0]!.response_conversation_id)
  expect(log.messages.every((entry) => entry.chatbotId === botId)).toBe(true)
})

test('an unpublished or unknown id renders the neutral not-available state', async ({ page }) => {
  // bot-menu ships as a seeded DRAFT in the mock.
  await page.goto('/chat/bot-menu')
  await expect(page.getByTestId('visitor-unavailable')).toContainText(
    'This assistant isn’t available right now.',
  )
  await expect(page.getByTestId('visitor-composer')).toHaveCount(0)
})

test('visitor sees the calm plan-limit state (402) when the company is exhausted', async ({
  page,
}) => {
  const botId = await publishBot('Exhausted Café')
  await page.goto(`/chat/${botId}`)

  await page.getByTestId('visitor-composer').fill('__plan_limit__')
  await page.getByTestId('visitor-send').click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('plan limit')
  await expect(page.locator('body')).not.toContainText('402')
  await expect(page.getByTestId('visitor-retry')).toHaveCount(0) // retrying cannot help
  // The composer still works — the visitor can ask something else.
  await expect(page.getByTestId('visitor-composer')).toBeEditable()
})

test('visitor sees the rate-limit state (429) when messages come too fast', async ({ page }) => {
  const botId = await publishBot('Busy Café')
  await page.goto(`/chat/${botId}`)

  await page.getByTestId('visitor-composer').fill('__rate_limit__')
  await page.getByTestId('visitor-send').click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Too many messages')
  await expect(page.locator('body')).not.toContainText('429')
  await expect(page.getByTestId('visitor-retry')).toBeVisible()
})
