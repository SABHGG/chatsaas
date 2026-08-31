import { chromium } from '@playwright/test'

/**
 * Empirical world-token probe (Batch D validation): boots a real
 * Chromium against the running local stack and reads computed styles —
 * Patch Amber on the live jack, Operator's Ivory on the shell, Slate
 * Ink text. Proves the Tailwind v4 token layer renders, not just
 * compiles.
 */

const ACCESS = process.argv[2]
const ID_TOKEN = process.argv[3]

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addCookies([
  { name: 'access_token', value: ACCESS, url: 'http://127.0.0.1:4310', httpOnly: true, expires: Date.now() / 1000 + 3600, sameSite: 'Lax' },
  { name: 'id_token', value: ID_TOKEN, url: 'http://127.0.0.1:4310', httpOnly: true, expires: Date.now() / 1000 + 3600, sameSite: 'Lax' },
])
const page = await context.newPage()
await page.goto('http://127.0.0.1:4310/board')
await page.waitForSelector('[data-testid="board-line-link"]')
await page.waitForTimeout(500)

const tokens = await page.evaluate(() => {
  const jacks = [...document.querySelectorAll('[data-testid="board-line-link"] [data-testid="jack-card"]')]
  const header = document.querySelector('header')
  const title = document.querySelector('h1')
  return {
    boardJacks: jacks.map((card) => ({
      name: card.querySelector('[data-testid="jack-name"]')?.textContent ?? null,
      lineState: card.getAttribute('data-line-state'),
      jackBackground: card.querySelector('[data-testid="jack-body"]')
        ? getComputedStyle(card.querySelector('[data-testid="jack-body"]')).backgroundColor
        : null,
    })),
    headerBackground: header ? getComputedStyle(header).backgroundColor : null,
    titleColor: title ? getComputedStyle(title).color : null,
    titleFont: title ? getComputedStyle(title).fontFamily.split(',')[0] : null,
    boxShadowOnCards: (() => {
      const card = document.querySelector('[data-testid="jack-card"]')
      return card ? getComputedStyle(card).boxShadow : null
    })(),
  }
})
console.log(JSON.stringify(tokens, null, 2))
await browser.close()
