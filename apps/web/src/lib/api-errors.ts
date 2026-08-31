import { z } from 'zod'

/**
 * Error body shape shared by every API error response. The REAL backend
 * (apps/functions) answers `{ success: false, error, code }` — `error`
 * is a human sentence, `code` is the machine code the spec's clients
 * expect under `error`. The spec's `details?/path?/timestamp?` extras
 * stay optional so both envelopes parse.
 */
export const apiErrorBodySchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
  path: z.string().optional(),
  timestamp: z.string().optional(),
})

/**
 * Machine-readable error codes from the API spec. Kept open-ended: the API
 * may add codes; unknown ones still surface with a status-based message.
 */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'NOT_FOUND_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'SERVER_ERROR'
  | 'INSUFFICIENT_CREDITS'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | (string & {})

/**
 * Operator-language copy for each failure. The line vocabulary is binding:
 * HTTP 429 renders exactly "On hold". Copy names the problem and the
 * recovery; no cloud or infrastructure jargon (ADR-007).
 */
export const HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: 'That request didn\u2019t look right. Check the input and try again.',
  401: 'Your session expired. Sign in again to keep working.',
  402: 'You\u2019re out of credits for this line. Top up your plan to continue.',
  403: 'You don\u2019t have access to this.',
  404: 'That item is no longer on the board.',
  408: 'The request took too long. Try again.',
  429: 'On hold',
  500: 'Something failed on our side. Try again in a moment.',
  502: 'The line dropped before an answer came back. Try again.',
  503: 'The board is briefly unavailable. Try again in a moment.',
}

/** Thrown by the API client for every non-2xx (or unparseable) response. */
export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly details?: unknown

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/**
 * Map a spec error body + HTTP status to the operator-language message.
 * The body's `error` field is treated as a code hint, never shown raw.
 */
export function toOperatorMessage(status: number, code?: ApiErrorCode): string {
  if (status === 429) return HTTP_ERROR_MESSAGES[429]
  if (status === 402 && code === 'INSUFFICIENT_CREDITS') return HTTP_ERROR_MESSAGES[402]
  return HTTP_ERROR_MESSAGES[status] ?? 'Something went wrong. Try again.'
}

/** Normalize any thrown value into an ApiError with operator-language copy. */
export function asApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  if (err instanceof Error) {
    // Network-level failure (fetch rejection): the line never answered.
    return new ApiError(0, 'NETWORK_ERROR', 'Can\u2019t reach the board. Check your connection and try again.')
  }
  return new ApiError(0, 'NETWORK_ERROR', toOperatorMessage(500))
}
