import { z } from 'zod'
import { ApiError, apiErrorBodySchema, asApiError, toOperatorMessage } from './api-errors'
import { bffProxyPath } from './bff'

/**
 * XHR document upload through the BFF proxy (WI-007 Task 10).
 *
 * Why XHR and not fetch: only XHR exposes upload progress events, and
 * the operator watches a 10 MB file climb the meter. The request goes to
 * the same-origin proxy route (`/api/proxy/...`) — never the API host —
 * which attaches the Bearer token from the httpOnly cookie server-side
 * and enforces the CSRF header.
 *
 * Transport (reconciled with the real backend, apps/functions
 * documentsUpload.ts): the file rides as the RAW request body, not
 * multipart — metadata travels in the `x-filename` and `x-mime-type`
 * headers. The response answers only `{ documentId, status, s3Key,
 * companyId, chatbotId }`, so the display fields (name, size, type) are
 * filled from the File the operator picked — client-known facts, not
 * invented API data.
 *
 * Retry contract: exactly ONE retry on transient network failure (the
 * request never left the browser, or the connection dropped mid-flight).
 * HTTP error statuses are never retried — the API's structured error is
 * surfaced in operator language instead (429 → "On hold").
 */

/** The backend upload response (`data` field) — all it confirms. */
export const uploadResponseSchema = z.object({
  documentId: z.string(),
  status: z.string(),
  s3Key: z.string(),
  companyId: z.string(),
  chatbotId: z.string(),
})

/**
 * The document as the wizard drafts it: the API-confirmed id/status
 * merged with the client-known file facts. (The real backend does not
 * echo filename/size back — see the transport note above.)
 */
export interface UploadedDocument {
  id: string
  fileName: string
  fileSize: number
  contentType: string
  status: string
}

/** File rules straight from the API spec: 10 MB max, these extensions. */
export const UPLOAD_MAX_SIZE_BYTES = 10 * 1024 * 1024
export const UPLOAD_ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'] as const

/** The MIME the backend expects for each accepted extension. */
const MIME_BY_EXTENSION: Record<(typeof UPLOAD_ACCEPTED_EXTENSIONS)[number], string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
}

/** Client-side pre-check so the operator learns a rejection instantly. */
export function validateUploadFile(file: File): string | null {
  if (file.size > UPLOAD_MAX_SIZE_BYTES) {
    return 'That file is over 10 MB. Split it or send a smaller one.'
  }
  const name = file.name.toLowerCase()
  const allowed = UPLOAD_ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))
  if (!allowed) {
    return `That file type doesn't ride this line. Use ${UPLOAD_ACCEPTED_EXTENSIONS.map((e) => e.toUpperCase().slice(1)).join(', ')}.`
  }
  return null
}

export interface UploadOptions {
  file: File
  /** The chatbot (line) the document is being wired into. */
  chatbotId: string
  /** Upload progress as a 0–100 percentage. */
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

export interface XMLHttpRequestLike {
  open(method: string, url: string): void
  setRequestHeader(name: string, value: string): void
  send(body: File): void
  abort(): void
  addEventListener(type: 'load' | 'error' | 'abort' | 'timeout', listener: () => void): void
  upload: { addEventListener(type: 'progress', listener: (event: ProgressEvent<EventTarget>) => void): void }
  status: number
  responseText: string
}

/**
 * Perform one upload attempt. Throws a plain Error on network-level
 * failure (status 0 / error / timeout) and an ApiError for HTTP
 * failures with the operator-language message already attached.
 */
function uploadOnce(options: UploadOptions, xhrFactory: () => XMLHttpRequestLike): Promise<UploadedDocument> {
  return new Promise((resolve, reject) => {
    const { file, chatbotId, onProgress, signal } = options

    const xhr = xhrFactory()

    // The backend rejects unknown extensions itself; the extension also
    // decides the transport MIME (x-mime-type header + request content
    // type). A file with a known extension always has a mapping here
    // because validateUploadFile ran before the upload started.
    const extension = UPLOAD_ACCEPTED_EXTENSIONS.find((ext) => file.name.toLowerCase().endsWith(ext))
    const mimeType = extension ? MIME_BY_EXTENSION[extension] : file.type

    xhr.open('POST', bffProxyPath(`/chatbots/${encodeURIComponent(chatbotId)}/documents`))
    // CSRF header (R-7) — the proxy rejects mutations without it.
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
    // Raw-body transport metadata (reconciled backend contract).
    xhr.setRequestHeader('x-filename', file.name)
    xhr.setRequestHeader('x-mime-type', mimeType)
    xhr.setRequestHeader('Content-Type', mimeType)

    signal?.addEventListener('abort', () => xhr.abort())

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const parsed = uploadResponseSchema.safeParse(JSON.parse(xhr.responseText).data)
          if (!parsed.success) {
            reject(new ApiError(xhr.status, 'PARSE_ERROR', toOperatorMessage(500)))
            return
          }
          // The backend confirms the id and status; the display fields
          // come from the file the operator picked.
          resolve({
            id: parsed.data.documentId,
            fileName: file.name,
            fileSize: file.size,
            contentType: mimeType,
            status: parsed.data.status,
          })
        } catch {
          reject(new ApiError(xhr.status, 'PARSE_ERROR', toOperatorMessage(500)))
        }
        return
      }

      // Structured API error → operator language (429 → "On hold").
      let code: string | undefined
      try {
        const body = apiErrorBodySchema.safeParse(JSON.parse(xhr.responseText))
        if (body.success) code = body.data.code ?? body.data.error
      } catch {
        // Non-JSON body: status-based copy still applies.
      }
      reject(new ApiError(xhr.status, code ?? 'SERVER_ERROR', toOperatorMessage(xhr.status, code)))
    })

    xhr.addEventListener('error', () => reject(new Error('network error')))
    xhr.addEventListener('timeout', () => reject(new Error('timeout')))
    xhr.addEventListener('abort', () => reject(new DOMException('Upload aborted', 'AbortError')))

    // The file rides as the raw request body (reconciled backend
    // contract) — progress events still fire on the upload stream.
    xhr.send(file)
  })
}

/** True when the failure was transient (never answered / dropped). */
function isTransientNetworkFailure(err: unknown): boolean {
  return err instanceof Error && !(err instanceof ApiError) && err.name !== 'AbortError'
}

/**
 * Upload a document with exactly one retry on transient network
 * failure. Progress fires per attempt (the meter resets and climbs
 * again on the retry — honest instrumentation, not decoration).
 */
export async function uploadDocument(options: UploadOptions, xhrFactory?: () => XMLHttpRequestLike): Promise<UploadedDocument> {
  const createXhr = xhrFactory ?? (() => new XMLHttpRequest() as unknown as XMLHttpRequestLike)
  try {
    return await uploadOnce(options, createXhr)
  } catch (err) {
    if (!isTransientNetworkFailure(err)) throw err
    // The single retry (WI-007 Task 10). If the line is still down, the
    // operator gets the network-failure copy, not a stack trace.
    try {
      return await uploadOnce(options, createXhr)
    } catch (retryErr) {
      throw asApiError(retryErr)
    }
  }
}
