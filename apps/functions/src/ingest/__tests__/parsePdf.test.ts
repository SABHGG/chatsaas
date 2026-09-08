import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Buffer } from 'node:buffer'
import { parsePdf, normalizePages } from '../parsePdf'

const extractTextMock = vi.fn()

beforeEach(() => {
  extractTextMock.mockReset()
})

const deps = { extractText: extractTextMock }

describe('normalizePages', () => {
  it('trims whitespace on each page', () => {
    expect(normalizePages(['  x  ', '  y  '])).toEqual(['x', 'y'])
  })

  it('keeps empty pages (the caller decides whether to drop them)', () => {
    expect(normalizePages(['text', '   '])).toEqual(['text', ''])
  })
})

describe('parsePdf', () => {
  it('returns one trimmed entry per page (unpdf per-page shape)', async () => {
    extractTextMock.mockResolvedValueOnce({
      totalPages: 2,
      text: ['Page 1 content', 'Page 2 content'],
    })
    const pages = await parsePdf(Buffer.from('ignored'), deps)
    expect(pages).toEqual(['Page 1 content', 'Page 2 content'])
    expect(extractTextMock).toHaveBeenCalledWith(new Uint8Array(Buffer.from('ignored')))
  })

  it('keeps empty pages as empty strings for the caller to drop', async () => {
    extractTextMock.mockResolvedValueOnce({
      totalPages: 2,
      text: ['Only real page', '   '],
    })
    const pages = await parsePdf(Buffer.from('ignored'), deps)
    expect(pages).toEqual(['Only real page', ''])
  })

  it('returns an empty array for an empty buffer', async () => {
    await expect(parsePdf(Buffer.alloc(0), deps)).rejects.toThrow(/empty/)
    expect(extractTextMock).not.toHaveBeenCalled()
  })

  it('propagates the underlying parse error', async () => {
    extractTextMock.mockRejectedValueOnce(new Error('invalid pdf structure'))
    await expect(parsePdf(Buffer.from('not a pdf'), deps)).rejects.toThrow()
  })
})
