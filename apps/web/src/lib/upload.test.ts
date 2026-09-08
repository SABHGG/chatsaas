// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from './api-errors'
import { uploadDocument, UPLOAD_MAX_SIZE_BYTES, validateUploadFile, type XMLHttpRequestLike } from './upload'

/**
 * WI-007 Task 10: XHR upload against the BFF proxy — progress events,
 * exactly ONE retry on transient network failure, and structured API
 * errors surfaced in operator language (429 → "On hold").
 */

/** Flush pending microtasks so the retry attempt actually starts. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

type UploadListener = (event: ProgressEvent<EventTarget>) => void
type SimpleListener = () => void

class FakeXHR implements XMLHttpRequestLike {
  static instances: FakeXHR[] = []

  method = ''
  url = ''
  headers: Record<string, string> = {}
  sentBody: File | null = null
  status = 0
  responseText = ''

  private listeners = new Map<string, SimpleListener[]>()
  private progressListeners: UploadListener[] = []

  readonly upload = {
    addEventListener: (type: 'progress', listener: UploadListener) => {
      if (type === 'progress') this.progressListeners.push(listener)
    },
  }

  open(method: string, url: string): void {
    this.method = method
    this.url = url
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value
  }

  send(body: File): void {
    this.sentBody = body
    FakeXHR.instances.push(this)
  }

  addEventListener(type: 'load' | 'error' | 'abort' | 'timeout', listener: SimpleListener): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }

  abort(): void {
    this.listeners.get('abort')?.forEach((listener) => listener())
  }

  respond(status: number, body: unknown): void {
    this.status = status
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body)
    this.listeners.get('load')?.forEach((listener) => listener())
  }

  failNetwork(): void {
    this.listeners.get('error')?.forEach((listener) => listener())
  }

  progress(loaded: number, total: number): void {
    const event = { lengthComputable: true, loaded, total } as unknown as ProgressEvent<EventTarget>
    this.progressListeners.forEach((listener) => listener(event))
  }
}

function makeFile(name = 'price-list.pdf', sizeMb = 1): File {
  const file = new File([new Uint8Array(8)], name, { type: 'application/pdf' })
  Object.defineProperty(file, 'size', { value: sizeMb * 1024 * 1024 })
  return file
}

/** The backend upload response `data` (documentsUpload.ts wire shape). */
const UPLOAD_RESPONSE = {
  documentId: 'doc-1',
  status: 'uploaded',
  s3Key: 'company-1/bot-1/doc-1/price-list.pdf',
  companyId: 'company-1',
  chatbotId: 'bot-1',
}

beforeEach(() => {
  FakeXHR.instances = []
})

describe('uploadDocument', () => {
  it('posts the raw file with metadata headers to the BFF proxy, CSRF header attached', async () => {
    const file = makeFile()
    const pending = uploadDocument({ file, chatbotId: 'bot-1' }, () => new FakeXHR())
    const xhr = FakeXHR.instances[0]!

    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe('/api/proxy/chatbots/bot-1/documents')
    expect(xhr.headers['X-Requested-With']).toBe('XMLHttpRequest')
    // Reconciled backend transport: raw body + x-filename / x-mime-type.
    expect(xhr.headers['x-filename']).toBe('price-list.pdf')
    expect(xhr.headers['x-mime-type']).toBe('application/pdf')
    expect(xhr.headers['Content-Type']).toBe('application/pdf')
    expect(xhr.sentBody).toBe(file)

    xhr.respond(201, { data: UPLOAD_RESPONSE })
    // The API confirms id + status; display fields come from the File.
    await expect(pending).resolves.toEqual({
      id: 'doc-1',
      fileName: 'price-list.pdf',
      fileSize: 1024 * 1024,
      contentType: 'application/pdf',
      status: 'uploaded',
    })
  })

  it('reports upload progress percentages', async () => {
    const seen: number[] = []
    const pending = uploadDocument(
      { file: makeFile(), chatbotId: 'bot-1', onProgress: (percent) => seen.push(percent) },
      () => new FakeXHR(),
    )
    const xhr = FakeXHR.instances[0]!
    xhr.progress(25, 100)
    xhr.progress(75, 100)
    xhr.respond(201, { data: UPLOAD_RESPONSE })
    await pending

    expect(seen).toEqual([25, 75])
  })

  it('retries exactly once on transient network failure and succeeds', async () => {
    const pending = uploadDocument({ file: makeFile(), chatbotId: 'bot-1' }, () => new FakeXHR())

    FakeXHR.instances[0]!.failNetwork() // the line dropped mid-flight
    await flush()
    FakeXHR.instances[1]!.respond(201, { data: UPLOAD_RESPONSE })

    await expect(pending).resolves.toMatchObject({ id: 'doc-1' })
    expect(FakeXHR.instances).toHaveLength(2)
  })

  it('gives up after the single retry when the network is still down', async () => {
    const pending = uploadDocument({ file: makeFile(), chatbotId: 'bot-1' }, () => new FakeXHR())

    FakeXHR.instances[0]!.failNetwork()
    await flush()
    FakeXHR.instances[1]!.failNetwork()

    await expect(pending).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(FakeXHR.instances).toHaveLength(2)
  })

  it('never retries HTTP errors and renders 429 as "On hold"', async () => {
    const pending = uploadDocument({ file: makeFile(), chatbotId: 'bot-1' }, () => new FakeXHR())

    FakeXHR.instances[0]!.respond(429, { error: 'RATE_LIMIT_ERROR' })

    const err = await pending.catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(429)
    expect((err as ApiError).message).toBe('On hold')
    expect(FakeXHR.instances).toHaveLength(1)
  })

  it('maps structured API errors to operator language without retrying', async () => {
    const pending = uploadDocument({ file: makeFile(), chatbotId: 'bot-1' }, () => new FakeXHR())

    FakeXHR.instances[0]!.respond(400, { error: 'VALIDATION_ERROR' })

    const err = (await pending.catch((e: unknown) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(400)
    expect(err.message).toContain('didn’t look right')
    expect(FakeXHR.instances).toHaveLength(1)
  })

  it('does not retry an aborted upload', async () => {
    const controller = new AbortController()
    const pending = uploadDocument({ file: makeFile(), chatbotId: 'bot-1', signal: controller.signal }, () => new FakeXHR())

    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(FakeXHR.instances).toHaveLength(1)
  })

  it('rejects an unparseable success body as a parse error', async () => {
    const pending = uploadDocument({ file: makeFile(), chatbotId: 'bot-1' }, () => new FakeXHR())

    FakeXHR.instances[0]!.respond(201, { data: { broken: true } })

    await expect(pending).rejects.toMatchObject({ code: 'PARSE_ERROR' })
  })
})

describe('validateUploadFile', () => {
  it('accepts the spec extensions', () => {
    expect(validateUploadFile(makeFile('menu.md'))).toBeNull()
    expect(validateUploadFile(makeFile('brochure.PDF'))).toBeNull()
    expect(validateUploadFile(makeFile('notes.docx'))).toBeNull()
    expect(validateUploadFile(makeFile('script.txt'))).toBeNull()
  })

  it('rejects oversized files in operator language', () => {
    const message = validateUploadFile(makeFile('big.pdf', 11))
    expect(message).toContain('over 10 MB')
    expect(UPLOAD_MAX_SIZE_BYTES).toBe(10 * 1024 * 1024)
  })

  it('rejects unsupported file types in operator language', () => {
    const message = validateUploadFile(makeFile('photo.jpg'))
    expect(message).toContain("doesn't ride this line")
    expect(message).toContain('PDF, DOCX, TXT, MD')
  })
})
