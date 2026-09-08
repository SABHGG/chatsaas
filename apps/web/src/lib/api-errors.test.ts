import { describe, expect, it } from 'vitest'
import { ApiError, HTTP_ERROR_MESSAGES, asApiError, toOperatorMessage } from './api-errors'

/**
 * Contract guard for the operator-language error map (WI-007 Task 3):
 * HTTP 429 must render the line-vocabulary string "On hold".
 */
describe('api-errors', () => {
  it('renders the line-vocabulary string on HTTP 429', () => {
    expect(toOperatorMessage(429)).toBe('On hold')
    expect(HTTP_ERROR_MESSAGES[429]).toBe('On hold')
  })

  it('maps the binding statuses to operator language, not jargon', () => {
    expect(toOperatorMessage(401)).toMatch(/sign in/i)
    expect(toOperatorMessage(402)).toMatch(/credits/i)
    expect(toOperatorMessage(404)).toBeTruthy()
    expect(toOperatorMessage(500)).toBeTruthy()
  })

  it('wraps network failures as a reachable-board error', () => {
    const err = asApiError(new TypeError('fetch failed'))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('NETWORK_ERROR')
    expect(err.message).toMatch(/board/i)
  })

  it('keeps ApiError instances intact', () => {
    const original = new ApiError(429, 'RATE_LIMIT_ERROR', 'On hold')
    expect(asApiError(original)).toBe(original)
  })
})
