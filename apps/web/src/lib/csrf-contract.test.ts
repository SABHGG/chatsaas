import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { apiGet, apiPost } from './api-client'
import { proxyRequest } from './bff-request'
import { uploadDocument, type XMLHttpRequestLike } from './upload'

/**
 * WI-007 Task 16 — CSRF header contract, at least one mutation per
 * resource (R-7). Every mutation the browser issues must ride the BFF
 * proxy path and carry `X-Requested-With: XMLHttpRequest`; the proxy
 * fails closed without it (route.test.ts asserts the 403 gate). Reads
 * must NOT carry the header — its presence is the mutation signal.
 *
 * Resource → mutation matrix:
 *   chatbots  → POST /chatbots/:id/publish  + POST /chatbots/:id/unpublish
 *   documents → POST /chatbots/:id/documents (XHR upload, raw body)
 *   credits   → GET /credits/balance (read — no header)
 *   plans     → GET /plans/available (read — no header)
 */

const anyData = z.unknown()

const PUBLISH_RESPONSE = {
  status: 'published',
  url: 'https://chat.chatsaas.local/bot-1',
  iframe_src: '<iframe src="https://chat.chatsaas.local/bot-1"></iframe>',
  expires_at: null,
}

/** Minimal XHR fake: the upload only needs headers, url + a load listener. */
class HeaderXHR implements XMLHttpRequestLike {
  static instances: HeaderXHR[] = []

  method = ''
  url = ''
  headers: Record<string, string> = {}
  status = 0
  responseText = ''

  private loadListener: (() => void) | null = null
  readonly upload = { addEventListener: () => {} }

  open(method: string, url: string): void {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value
  }
  send(): void {
    HeaderXHR.instances.push(this)
  }
  abort(): void {}
  addEventListener(type: 'load' | 'error' | 'abort' | 'timeout', listener: () => void): void {
    if (type === 'load') this.loadListener = listener
  }

  respond(status: number, body: unknown): void {
    this.status = status
    this.responseText = JSON.stringify(body)
    this.loadListener?.()
  }
}

let lastHeaders: Record<string, string> = {}

beforeEach(() => {
  lastHeaders = {}
  HeaderXHR.instances = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string | URL, init?: RequestInit): Promise<Response> => {
      lastHeaders = Object.fromEntries(new Headers(init?.headers).entries())
      return Response.json({ data: PUBLISH_RESPONSE }, { status: 202 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CSRF header contract — one mutation per resource (R-7)', () => {
  it('chatbots: publish carries X-Requested-With through the BFF proxy path', async () => {
    await proxyRequest('/chatbots/bot-1/publish', {
      method: 'POST',
      body: { plan_id: 'plan-starter' },
      dataSchema: anyData,
    })

    expect(lastHeaders['x-requested-with']).toBe('XMLHttpRequest')
  })

  it('chatbots: unpublish carries X-Requested-With through the BFF proxy path', async () => {
    await proxyRequest('/chatbots/bot-1/unpublish', {
      method: 'POST',
      dataSchema: anyData,
    })

    expect(lastHeaders['x-requested-with']).toBe('XMLHttpRequest')
  })

  it('documents: the XHR upload sets X-Requested-With on the proxy path', async () => {
    const file = new File([new Uint8Array(8)], 'price-list.pdf', { type: 'application/pdf' })
    const pending = uploadDocument({ file, chatbotId: 'bot-1' }, () => new HeaderXHR())
    const xhr = HeaderXHR.instances[0]!

    expect(xhr.url).toBe('/api/proxy/chatbots/bot-1/documents')
    expect(xhr.headers['X-Requested-With']).toBe('XMLHttpRequest')

    // Settle the promise (the header assertions above are the point).
    xhr.respond(201, {
      data: {
        documentId: 'doc-1',
        status: 'uploaded',
        s3Key: 'company-1/bot-1/doc-1/price-list.pdf',
        companyId: 'company-1',
        chatbotId: 'bot-1',
      },
    })
    await expect(pending).resolves.toMatchObject({ id: 'doc-1' })
  })

  it('credits and plans are reads: GETs do not carry the CSRF header', async () => {
    await apiGet('/credits/balance', anyData, { baseUrl: 'http://api.test/api' })
    expect(lastHeaders['x-requested-with']).toBeUndefined()

    await apiGet('/plans/available', anyData, { baseUrl: 'http://api.test/api' })
    expect(lastHeaders['x-requested-with']).toBeUndefined()
  })

  it('a direct mutation helper (apiPost) still stamps the header — chatbot create', async () => {
    await apiPost('/chatbots', anyData, {
      body: { name: 'Front desk', description: null },
      baseUrl: 'http://api.test/api',
    })

    expect(lastHeaders['x-requested-with']).toBe('XMLHttpRequest')
  })
})
