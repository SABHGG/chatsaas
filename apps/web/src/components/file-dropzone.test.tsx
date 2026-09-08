// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FileDropzone } from './file-dropzone'

/**
 * WI-007 Task 10: the dropzone keeps a keyboard-accessible file input
 * fallback, shows XHR upload progress against the BFF proxy, and
 * surfaces structured API errors in operator language (429 → "On
 * hold"). The real XMLHttpRequest is stubbed with a minimal fake.
 */

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

  // The component never aborts mid-test; keep the surface compatible.
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

/** The backend upload response `data` (documentsUpload.ts wire shape). */
const UPLOAD_RESPONSE = {
  documentId: 'doc-1',
  status: 'uploaded',
  s3Key: 'company-1/bot-1/doc-1/price-list.pdf',
  companyId: 'company-1',
  chatbotId: 'bot-1',
}

function makePdf(name = 'price-list.pdf'): File {
  // 1 KB so the display size rides the picked file (the backend does not
  // echo size back — reconciled contract).
  return new File([new Uint8Array(1024)], name, { type: 'application/pdf' })
}

function dropFile(file: File): void {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

function renderDropzone(onUploaded = vi.fn()) {
  render(<FileDropzone chatbotId="bot-1" onUploaded={onUploaded} />)
  return screen.getByRole('button', { name: /add documents/i })
}

beforeEach(() => {
  FakeXHR.instances = []
  vi.stubGlobal('XMLHttpRequest', FakeXHR)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('FileDropzone', () => {
  it('keeps a keyboard-accessible file input fallback', () => {
    const zone = renderDropzone()

    expect(zone.getAttribute('tabindex')).toBe('0')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.accept).toBe('.pdf,.docx,.txt,.md')
  })

  it('opens the file picker from the visible region exactly once per activation', () => {
    renderDropzone()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    let pickerActivations = 0
    const counter = () => {
      pickerActivations += 1
    }
    input.addEventListener('click', counter)

    fireEvent.click(screen.getByRole('button', { name: /add documents/i }))
    input.removeEventListener('click', counter)

    // One activation, one picker call — the input's own bubbled click
    // must not loop back into the region's handler.
    expect(pickerActivations).toBe(1)
  })

  it('uploads through the BFF proxy with progress and hands the document back', async () => {
    const onUploaded = vi.fn()
    const zone = renderDropzone(onUploaded)

    dropFile(makePdf())
    const xhr = FakeXHR.instances[0]!
    expect(xhr.url).toBe('/api/proxy/chatbots/bot-1/documents')
    expect(xhr.headers['X-Requested-With']).toBe('XMLHttpRequest')

    await act(async () => {
      xhr.progress(50, 100)
    })
    expect(screen.getByTestId('dropzone-uploading').textContent).toContain('50%')

    await act(async () => {
      xhr.respond(201, { data: UPLOAD_RESPONSE })
    })
    expect(onUploaded).toHaveBeenCalledWith({
      id: 'doc-1',
      fileName: 'price-list.pdf',
      fileSize: 1024,
      contentType: 'application/pdf',
      status: 'uploaded',
    })
    expect(screen.queryByTestId('dropzone-uploading')).toBeNull()
    expect(zone).toBeTruthy()
  })

  it('surfaces a 429 as "On hold" in operator language', async () => {
    renderDropzone()

    dropFile(makePdf())
    await act(async () => {
      FakeXHR.instances[0]!.respond(429, { error: 'RATE_LIMIT_ERROR' })
    })

    expect(screen.getByTestId('dropzone-error').textContent).toBe('On hold')
  })

  it('rejects wrong file types before touching the wire', async () => {
    renderDropzone()

    dropFile(makePdf('photo.jpg'))

    expect(await screen.findByTestId('dropzone-error')).toBeTruthy()
    expect(screen.getByTestId('dropzone-error').textContent).toContain("doesn't ride this line")
    expect(FakeXHR.instances).toHaveLength(0)
  })

  it('rejects oversized files before touching the wire', async () => {
    renderDropzone()
    const file = makePdf('big.pdf')
    Object.defineProperty(file, 'size', { value: 11 * 1024 * 1024 })

    dropFile(file)

    expect(await screen.findByTestId('dropzone-error')).toBeTruthy()
    expect(screen.getByTestId('dropzone-error').textContent).toContain('over 10 MB')
    expect(FakeXHR.instances).toHaveLength(0)
  })
})
