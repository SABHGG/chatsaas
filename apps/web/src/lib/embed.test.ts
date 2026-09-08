import { describe, expect, it } from 'vitest'
import { IFRAME_SNIPPET_TEMPLATE, buildIframeSnippet, copyToClipboard } from './embed'

/**
 * WI-007 Task 15 (R-6): the string the operator copies is part of the
 * security contract. These tests pin the EXACT output and reject any
 * drift in the sandbox/referrer/loading attributes.
 */

// A real-shaped host URL: PUBLIC_CHAT_BASE_URL (api-spec.md) + chatbot id.
const HOST_URL = 'https://chat.chatsaas.local/1b671a64-40d5-491e-99b0-da01ff1f3341'

const EXACT_SNIPPET = [
  '<iframe src="https://chat.chatsaas.local/1b671a64-40d5-491e-99b0-da01ff1f3341" title="chatSaaS chat" loading="lazy"',
  '  sandbox="allow-scripts allow-same-origin"',
  '  referrerpolicy="strict-origin-when-cross-origin"',
  '  style="border: 0; width: 100%; height: 480px;"></iframe>',
].join('\n')

describe('buildIframeSnippet', () => {
  it('produces the exact string the operator copies', () => {
    expect(buildIframeSnippet(HOST_URL)).toBe(EXACT_SNIPPET)
  })

  it('escapes attribute-breaking characters in the URL', () => {
    const hostile = 'https://chat.chatsaas.local/x?a=1&b="><script>'
    const snippet = buildIframeSnippet(hostile)
    expect(snippet).toContain('src="https://chat.chatsaas.local/x?a=1&amp;b=&quot;><script>"')
    expect(snippet).not.toContain('src="https://chat.chatsaas.local/x?a=1&b=">')
  })

  it('keeps the template security attributes exact', () => {
    // The sandbox is deliberately minimal (SECURITY note in embed.ts).
    expect(IFRAME_SNIPPET_TEMPLATE).toContain('sandbox="allow-scripts allow-same-origin"')
    expect(IFRAME_SNIPPET_TEMPLATE).not.toContain('allow-top-navigation')
    expect(IFRAME_SNIPPET_TEMPLATE).not.toContain('allow-popups')
    expect(IFRAME_SNIPPET_TEMPLATE).toContain('referrerpolicy="strict-origin-when-cross-origin"')
    expect(IFRAME_SNIPPET_TEMPLATE).toContain('loading="lazy"')
  })
})

describe('copyToClipboard', () => {
  it('fails gracefully where no clipboard exists (node)', async () => {
    // No navigator.clipboard and no document in this environment.
    await expect(copyToClipboard('snippet')).resolves.toBe(false)
  })
})
