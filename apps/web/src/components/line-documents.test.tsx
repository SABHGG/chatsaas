// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * The line detail pane's Documents section (founder bug fix): the pane
 * now wires in documents directly — upload affordance on draft AND
 * published lines, ingest status pills, retry on failed uploads, and
 * pane refreshes through the board's router.refresh() path (never a
 * second data source).
 */

const refreshSpy = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: refreshSpy }),
  usePathname: () => '/board',
}))

import { LineDocuments } from './line-documents'
import type { DocumentRecord } from '@/lib/api-schemas'

type UploadListener = (event: ProgressEvent<EventTarget>) => void

class FakeXHR {
  static instances: FakeXHR[] = []

  method = ''
  url = ''
  headers: Record<string, string> = {}
  status = 0
  responseText = ''

  private listeners = new Map<string, Array<() => void>>()
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

  send(): void {
    FakeXHR.instances.push(this)
  }

  abort(): void {
    this.listeners.get('abort')?.forEach((listener) => listener())
  }

  addEventListener(type: 'load' | 'error' | 'abort' | 'timeout', listener: () => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }

  respond(status: number, body: unknown): void {
    this.status = status
    this.responseText = JSON.stringify(body)
    this.listeners.get('load')?.forEach((listener) => listener())
  }

  progress(loaded: number, total: number): void {
    const event = { lengthComputable: true, loaded, total } as unknown as ProgressEvent<EventTarget>
    this.progressListeners.forEach((listener) => listener(event))
  }
}

const UPLOAD_RESPONSE = {
  documentId: 'doc-9',
  status: 'uploaded',
  s3Key: 'company-1/bot-1/doc-9/price-list.pdf',
  companyId: 'company-1',
  chatbotId: 'bot-1',
}

const DOC: DocumentRecord = {
  id: 'doc-1',
  chatbotId: 'bot-1',
  filename: 'front-desk-faq.txt',
  mimeType: 'text/plain',
  byteCount: 2048,
  status: 'ready',
  createdAt: '2026-08-31T10:01:00Z',
  updatedAt: '2026-08-31T10:05:00Z',
}

function makePdf(name = 'price-list.pdf'): File {
  return new File([new Uint8Array(1024)], name, { type: 'application/pdf' })
}

function dropFile(file: File): void {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

function renderSection(documents: DocumentRecord[] = [], error: { status: number; message: string } | null = null) {
  return render(
    <LineDocuments chatbotId="bot-1" documents={documents} documentsError={error} />,
  )
}

beforeEach(() => {
  FakeXHR.instances = []
  refreshSpy.mockClear()
  vi.stubGlobal('XMLHttpRequest', FakeXHR)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('LineDocuments — the detail pane upload affordance', () => {
  it('replaces the dead-end empty state with a working dropzone on a published line', () => {
    renderSection()

    expect(screen.getByTestId('file-dropzone')).toBeTruthy()
    expect(screen.getByRole('button', { name: /add documents for bot-1/i })).toBeTruthy()
    // The old copy sent operators to a wizard that mints a new line —
    // it must be gone for good.
    expect(screen.queryByText(/Upload them from the wizard/)).toBeNull()
  })

  it('lists documents with ingest status pills and the readiness counter', () => {
    renderSection([
      DOC,
      { ...DOC, id: 'doc-2', filename: 'menu.pdf', status: 'processing' },
    ])

    const rows = screen.getAllByTestId('detail-document-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('front-desk-faq.txt')
    const pills = screen.getAllByTestId('detail-document-status')
    expect(pills[0]!.textContent).toContain('Ready')
    expect(pills[0]!.getAttribute('data-status')).toBe('ready')
    expect(pills[1]!.textContent).toContain('Processing')
    expect(pills[1]!.getAttribute('data-status')).toBe('processing')
    expect(screen.getByTestId('detail-readiness').textContent).toContain('1 of 2 documents ready')
  })

  it('wires an uploaded document into the list immediately and refreshes the pane', async () => {
    renderSection()

    dropFile(makePdf())
    const xhr = FakeXHR.instances[0]!
    expect(xhr.url).toBe('/api/proxy/chatbots/bot-1/documents')
    expect(xhr.headers['X-Requested-With']).toBe('XMLHttpRequest')

    await act(async () => {
      xhr.respond(201, { data: UPLOAD_RESPONSE })
    })

    // Optimistic row (server truth replaces it on refresh), and the
    // board's refresh path carries the server list in.
    const row = await screen.findByTestId('detail-document-row')
    expect(row.textContent).toContain('price-list.pdf')
    expect(refreshSpy).toHaveBeenCalled()
    expect(screen.getByTestId('detail-readiness').textContent).toContain('0 of 1 documents ready')
  })

  it('retries a failed upload: dismiss the error and wire the file again', async () => {
    renderSection()

    dropFile(makePdf())
    await act(async () => {
      FakeXHR.instances[0]!.respond(500, { error: 'SERVER_ERROR' })
    })

    const error = await screen.findByTestId('dropzone-error')
    expect(error.textContent).toContain('Something failed on our side')

    fireEvent.click(screen.getByTestId('dropzone-dismiss'))
    expect(screen.queryByTestId('dropzone-error')).toBeNull()

    // The retry rides the same dropzone and lands as a pending row.
    dropFile(makePdf())
    await act(async () => {
      FakeXHR.instances[1]!.respond(201, { data: UPLOAD_RESPONSE })
    })
    expect(await screen.findByTestId('detail-document-row')).toBeTruthy()
  })

  it('keeps the 429 on-hold surface and offers no dropzone while reads are held', () => {
    renderSection([], { status: 429, message: 'On hold' })

    expect(screen.getByTestId('documents-on-hold').textContent).toContain('On hold')
    expect(screen.queryByTestId('file-dropzone')).toBeNull()
  })

  it('polls the pane while ingest is in flight and stops when it settles', async () => {
    vi.useFakeTimers()
    try {
      const { unmount } = renderSection([{ ...DOC, status: 'uploaded' }])

      await act(async () => {
        vi.advanceTimersByTime(5000)
      })
      expect(refreshSpy).toHaveBeenCalledTimes(1)
      await act(async () => {
        vi.advanceTimersByTime(5000)
      })
      expect(refreshSpy).toHaveBeenCalledTimes(2)
      unmount()

      // A settled list arms no poll.
      renderSection([{ ...DOC, status: 'ready' }])
      await act(async () => {
        vi.advanceTimersByTime(15000)
      })
      expect(refreshSpy).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
