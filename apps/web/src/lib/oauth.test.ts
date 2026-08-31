import { describe, expect, it } from 'vitest'
import { sanitizeNextPath } from './oauth'

/**
 * The `next` redirect target must never leave the origin (open-redirect
 * guard on the sign-in flow).
 */
describe('sanitizeNextPath', () => {
  it('keeps same-origin relative paths', () => {
    expect(sanitizeNextPath('/board')).toBe('/board')
    expect(sanitizeNextPath('/board/chatbots/b-1?tab=docs')).toBe('/board/chatbots/b-1?tab=docs')
  })

  it('rejects absolute URLs, protocol-relative paths, and backslash tricks', () => {
    expect(sanitizeNextPath('https://evil.example/board')).toBe('/board')
    expect(sanitizeNextPath('//evil.example/board')).toBe('/board')
    expect(sanitizeNextPath('/\\evil.example')).toBe('/board')
  })

  it('falls back on empty input', () => {
    expect(sanitizeNextPath(null)).toBe('/board')
    expect(sanitizeNextPath(undefined)).toBe('/board')
    expect(sanitizeNextPath('')).toBe('/board')
  })
})
