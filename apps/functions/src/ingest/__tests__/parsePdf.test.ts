import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Buffer } from 'node:buffer'
import { parsePdf, splitPdfPages } from '../parsePdf'

const pdfParseMock = vi.fn()

beforeEach(() => {
  pdfParseMock.mockReset()
})

const deps = { pdfParse: pdfParseMock }

describe('splitPdfPages', () => {
  it('splits on form-feed and drops the trailing empty page', () => {
    const pages = splitPdfPages({ text: 'a\fb\fc\f', numpages: 3 })
    expect(pages).toEqual(['a', 'b', 'c'])
  })

  it('trims whitespace on each page', () => {
    expect(splitPdfPages({ text: '  x  \f  y  ', numpages: 2 })).toEqual(['x', 'y'])
  })
})

describe('parsePdf', () => {
  it('returns one entry per page', async () => {
    pdfParseMock.mockResolvedValueOnce({
      text: 'Page 1 content\fPage 2 content',
      numpages: 2,
    })
    const pages = await parsePdf(Buffer.from('ignored'), deps)
    expect(pages).toEqual(['Page 1 content', 'Page 2 content'])
  })

  it('drops a trailing empty page from the form-feed split', async () => {
    pdfParseMock.mockResolvedValueOnce({
      text: 'Only page\f',
      numpages: 1,
    })
    const pages = await parsePdf(Buffer.from('ignored'), deps)
    expect(pages).toEqual(['Only page'])
  })

  it('returns an empty array for an empty buffer', async () => {
    await expect(parsePdf(Buffer.alloc(0), deps)).rejects.toThrow(/empty/)
    expect(pdfParseMock).not.toHaveBeenCalled()
  })

  it('propagates the underlying parse error', async () => {
    pdfParseMock.mockRejectedValueOnce(new Error('corrupt header'))
    await expect(parsePdf(Buffer.from('not a pdf'), deps)).rejects.toThrow()
  })
})
