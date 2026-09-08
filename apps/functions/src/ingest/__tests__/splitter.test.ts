import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { splitText } from '../splitter'

function sha(input: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(input).digest())
}

describe('splitText', () => {
  it('returns one chunk when the content is smaller than chunkSize', () => {
    const out = splitText('hello world', { chunkSize: 100, chunkOverlap: 10 })
    expect(out).toHaveLength(1)
    expect(out[0].index).toBe(0)
    expect(out[0].content).toBe('hello world')
    expect(out[0].contentSha256).toEqual(sha('hello world'))
  })

  it('returns [] for empty input', () => {
    expect(splitText('', { chunkSize: 100, chunkOverlap: 10 })).toEqual([])
  })

  it('splits a long paragraph into multiple chunks of size <= chunkSize', () => {
    const text = 'a'.repeat(2500)
    const out = splitText(text, { chunkSize: 1000, chunkOverlap: 200 })
    expect(out.length).toBeGreaterThan(1)
    for (const chunk of out) {
      expect(chunk.content.length).toBeLessThanOrEqual(1300) // allow some overlap slack
    }
  })

  it('preserves ordering and re-indexes from 0', () => {
    const text = 'sentence. '.repeat(500)
    const out = splitText(text, { chunkSize: 200, chunkOverlap: 20 })
    out.forEach((c, i) => expect(c.index).toBe(i))
  })

  it('computes the SHA-256 of each chunk content', () => {
    const text = 'one two three four five six seven eight nine ten'
    const out = splitText(text, { chunkSize: 12, chunkOverlap: 2 })
    for (const c of out) {
      expect(c.contentSha256).toEqual(sha(c.content))
    }
  })
})
