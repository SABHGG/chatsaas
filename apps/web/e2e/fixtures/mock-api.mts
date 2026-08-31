import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

/**
 * Mock backend API for the WI-007 e2e run (Task 17).
 *
 * Implements ONLY the endpoints the happy path hits, with the OBSERVED
 * backend shapes (apps/functions — reconciled in Batch D Task 0, not the
 * drifted api-spec.md):
 *
 *   GET  /api/chatbots                      { success, data: [chatbotDto] }
 *   POST /api/chatbots                      201 { success, data: chatbotDto }
 *   GET  /api/chatbots/published            { success, data: [dto + url + iframe_src] }
 *   POST /api/chatbots/:id/publish          202 { success, data: { status, url, iframe_src, expires_at } }
 *   POST /api/chatbots/:id/documents        raw body + x-filename/x-mime-type → 201 { documentId, status, s3Key, ... }
 *   GET  /api/chatbots/:id/documents        { success, data: { documents: DocumentRecord[] } } (camelCase)
 *   GET  /api/plans/available               { success, data: [{ id, name, description, price, interval }] }
 *   GET  /api/credits/balance               { success, data: { balance } }
 *
 * Uploaded documents come back `status: 'ready'` — the mock simulates
 * finished processing so the happy path can publish without the
 * DC-007-2 zero-ready dialog (that gate is covered by unit tests).
 *
 * `GET /api/_requests` exposes every received request (method, path and
 * the two security headers) so the e2e can assert that the CSRF header
 * and the Bearer token actually crossed the BFF proxy.
 */

const PORT = Number(process.env.E2E_API_PORT ?? 4311)
const HOST = process.env.E2E_HOST ?? '127.0.0.1'
const COMPANY_ID = 'company-e2e'
const PUBLIC_CHAT_BASE_URL = 'https://chat.chatsaas.local'

interface ChatbotRow {
  id: string
  companyId: string
  ownerSub: string
  name: string
  status: 'draft' | 'published' | 'archived'
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  planId?: string
}

interface DocumentRow {
  id: string
  chatbotId: string
  companyId: string
  ownerSub: string
  filename: string
  mimeType: string
  byteCount: number
  status: 'uploaded' | 'processing' | 'ready' | 'failed'
  s3Key: string
  metadata: Record<string, never>
  createdAt: string
  updatedAt: string
}

interface PlanRow {
  id: string
  name: string
  description: string | null
  price: number
  interval: string
}

const PLANS: PlanRow[] = [
  { id: 'plan-starter', name: 'Starter', description: 'One counter line, one knowledge base', price: 19, interval: 'monthly' },
  { id: 'plan-shop', name: 'Shop', description: 'For busier rooms and busier desks', price: 49, interval: 'monthly' },
]

const BASE_MS = Date.now()
const iso = (offsetMs: number) => new Date(BASE_MS - offsetMs).toISOString()

/** Seeded board: one live line, one draft — the amber jack ships in the captures. */
const chatbots: ChatbotRow[] = [
  {
    id: 'bot-front-desk',
    companyId: COMPANY_ID,
    ownerSub: 'e2e-operator-sub',
    name: 'Front Desk',
    status: 'published',
    createdAt: iso(48 * 60 * 60 * 1000),
    updatedAt: iso(20 * 60 * 60 * 1000),
    publishedAt: iso(20 * 60 * 60 * 1000),
    planId: 'plan-starter',
  },
  {
    id: 'bot-menu',
    companyId: COMPANY_ID,
    ownerSub: 'e2e-operator-sub',
    name: 'Menu Line',
    status: 'draft',
    createdAt: iso(24 * 60 * 60 * 1000),
    updatedAt: iso(24 * 60 * 60 * 1000),
    publishedAt: null,
  },
]

const documents: DocumentRow[] = [
  {
    id: 'doc-seeded',
    chatbotId: 'bot-front-desk',
    companyId: COMPANY_ID,
    ownerSub: 'e2e-operator-sub',
    filename: 'reception-faq.txt',
    mimeType: 'text/plain',
    byteCount: 512,
    status: 'ready',
    s3Key: `${COMPANY_ID}/bot-front-desk/doc-seeded/reception-faq.txt`,
    metadata: {},
    createdAt: iso(47 * 60 * 60 * 1000),
    updatedAt: iso(46 * 60 * 60 * 1000),
  },
]

interface CapturedRequest {
  method: string
  path: string
  xRequestedWith: string | null
  hasAuthorization: boolean
}

const capturedRequests: CapturedRequest[] = []

function chatbotDto(row: ChatbotRow) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    document_count: documents.filter((doc) => doc.chatbotId === row.id).length,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    published_at: row.publishedAt,
  }
}

function iframeSnippet(url: string): string {
  return `<iframe src="${url}" width="100%" height="600" frameborder="0"></iframe>`
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)
  const segments = url.pathname.split('/').filter(Boolean) // ['api', ...]
  const method = (req.method ?? 'GET').toUpperCase()

  const xrw = req.headers['x-requested-with']
  capturedRequests.push({
    method,
    path: url.pathname,
    xRequestedWith: (Array.isArray(xrw) ? xrw[0] : xrw) ?? null,
    hasAuthorization: typeof req.headers.authorization === 'string',
  })

  if (segments[0] !== 'api') {
    json(res, 404, { success: false, error: 'Not found', code: 'NOT_FOUND_ERROR' })
    return
  }
  const path = segments.slice(1)

  // Health + introspection.
  if (method === 'GET' && path[0] === 'healthz') {
    json(res, 200, { status: 'ok' })
    return
  }
  if (method === 'GET' && path[0] === '_requests') {
    json(res, 200, { requests: capturedRequests })
    return
  }

  // Plans + credits.
  if (method === 'GET' && path[0] === 'plans' && path[1] === 'available') {
    json(res, 200, { success: true, data: PLANS })
    return
  }
  if (method === 'GET' && path[0] === 'credits' && path[1] === 'balance') {
    json(res, 200, { success: true, data: { balance: 120 } })
    return
  }

  // Chatbots.
  if (path[0] === 'chatbots') {
    if (method === 'GET' && path.length === 1) {
      const rows = [...chatbots].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
      json(res, 200, { success: true, data: rows.map(chatbotDto) })
      return
    }
    if (method === 'GET' && path[1] === 'published') {
      const rows = chatbots
        .filter((row) => row.status === 'published')
        .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
        .map((row) => {
          const url2 = `${PUBLIC_CHAT_BASE_URL}/${row.id}`
          return { ...chatbotDto(row), url: url2, iframe_src: iframeSnippet(url2) }
        })
      json(res, 200, { success: true, data: rows })
      return
    }
    if (method === 'POST' && path.length === 1) {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}') as { name?: string }
      if (!body.name || typeof body.name !== 'string') {
        json(res, 400, { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR' })
        return
      }
      const now = iso(0)
      const row: ChatbotRow = {
        id: `bot-${Math.random().toString(36).slice(2, 8)}`,
        companyId: COMPANY_ID,
        ownerSub: 'e2e-operator-sub',
        name: body.name,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
      }
      chatbots.push(row)
      json(res, 201, { success: true, data: chatbotDto(row) })
      return
    }
    if (method === 'POST' && path[2] === 'publish') {
      const row = chatbots.find((candidate) => candidate.id === path[1])
      if (!row) {
        json(res, 404, { success: false, error: 'Chatbot not found', code: 'CHATBOT_NOT_FOUND' })
        return
      }
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}') as { plan_id?: string }
      if (!body.plan_id) {
        json(res, 400, { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR' })
        return
      }
      row.status = 'published'
      row.publishedAt = iso(0)
      row.updatedAt = iso(0)
      row.planId = body.plan_id
      const url2 = `${PUBLIC_CHAT_BASE_URL}/${row.id}`
      json(res, 202, {
        success: true,
        data: { status: 'published', url: url2, iframe_src: iframeSnippet(url2), expires_at: null },
      })
      return
    }
    if (method === 'POST' && path[2] === 'documents') {
      const row = chatbots.find((candidate) => candidate.id === path[1])
      if (!row) {
        json(res, 404, { success: false, error: 'Chatbot not found', code: 'CHATBOT_NOT_FOUND' })
        return
      }
      const raw = await readBody(req)
      // IncomingHttpHeaders values can be string | string[] | undefined.
      const header = (name: string): string | undefined => {
        const value = req.headers[name]
        return Array.isArray(value) ? value[0] : value
      }
      const filename = header('x-filename')
      const mimeType = header('x-mime-type')
      if (!filename || !mimeType || raw.length === 0) {
        json(res, 400, { success: false, error: 'Missing upload metadata', code: 'MISSING_FILENAME' })
        return
      }
      const documentId = `doc-${Math.random().toString(36).slice(2, 8)}`
      const s3Key = `${COMPANY_ID}/${row.id}/${documentId}/${filename}`
      const now = iso(0)
      // 'ready' — the mock simulates completed ingest processing.
      documents.push({
        id: documentId,
        chatbotId: row.id,
        companyId: COMPANY_ID,
        ownerSub: 'e2e-operator-sub',
        filename,
        mimeType,
        byteCount: raw.length,
        status: 'ready',
        s3Key,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      })
      row.updatedAt = now
      json(res, 201, {
        success: true,
        data: { documentId, status: 'uploaded', s3Key, companyId: COMPANY_ID, chatbotId: row.id },
      })
      return
    }
    if (method === 'GET' && path[2] === 'documents') {
      const row = chatbots.find((candidate) => candidate.id === path[1])
      if (!row) {
        json(res, 404, { success: false, error: 'Chatbot not found', code: 'CHATBOT_NOT_FOUND' })
        return
      }
      const rows = documents
        .filter((doc) => doc.chatbotId === row.id)
        .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
      json(res, 200, { success: true, data: { documents: rows } })
      return
    }
  }

  json(res, 404, { success: false, error: 'Not found', code: 'NOT_FOUND_ERROR' })
}

const server = createServer((req, res) => {
  void handle(req, res).catch((err: unknown) => {
    json(res, 500, { success: false, error: String(err), code: 'SERVER_ERROR' })
  })
})

server.listen(PORT, HOST, () => {
  process.stdout.write(`mock API listening on http://${HOST}:${PORT}/api\n`)
})
