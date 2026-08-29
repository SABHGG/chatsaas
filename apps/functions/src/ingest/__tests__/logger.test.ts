import { describe, it, expect } from 'vitest'
import { logger } from '../logger'

describe('logger', () => {
  it('does not throw on each level', () => {
    expect(() => logger.debug('d', { foo: 1 })).not.toThrow()
    expect(() => logger.info('i', { foo: 1 })).not.toThrow()
    expect(() => logger.warn('w', { foo: 1 })).not.toThrow()
    expect(() => logger.error('e', { foo: 1 })).not.toThrow()
  })
})
