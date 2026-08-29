import { describe, it, expect } from 'vitest'
import { parseText } from '../parseText'
import { Buffer } from 'node:buffer'

describe('parseText', () => {
  it('decodes UTF-8 and strips the BOM', () => {
    const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello', 'utf8')])
    expect(parseText(buffer, 'text/plain')).toBe('hello')
  })

  it('normalizes CRLF and CR line endings to LF', () => {
    expect(parseText(Buffer.from('a\r\nb\rc\n', 'utf8'), 'text/plain')).toBe('a\nb\nc')
  })

  it('trims surrounding whitespace', () => {
    expect(parseText(Buffer.from('  hello  ', 'utf8'), 'text/plain')).toBe('hello')
  })

  it('throws on an empty buffer', () => {
    expect(() => parseText(Buffer.alloc(0), 'text/plain')).toThrow(/empty/)
  })
})
