import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Buffer } from 'node:buffer'
import { parseDocx } from '../parseDocx'

const extractRawText = vi.fn()

const deps = {
  mammoth: { extractRawText },
}

beforeEach(() => {
  extractRawText.mockReset()
})

describe('parseDocx', () => {
  it('returns trimmed text from the mammoth result', async () => {
    extractRawText.mockResolvedValueOnce({ value: '  hello  \n  world  ', messages: [] })
    const out = await parseDocx(Buffer.from('ignored'), deps)
    expect(out).toBe('hello  \n  world')
  })

  it('throws on an empty buffer', async () => {
    await expect(parseDocx(Buffer.alloc(0), deps)).rejects.toThrow(/empty/)
    expect(extractRawText).not.toHaveBeenCalled()
  })

  it('propagates mammoth errors', async () => {
    extractRawText.mockRejectedValueOnce(new Error('corrupt docx'))
    await expect(parseDocx(Buffer.from('ignored'), deps)).rejects.toThrow(/corrupt/)
  })
})
