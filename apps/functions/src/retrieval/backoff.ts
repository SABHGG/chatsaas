/**
 * Shared bounded exponential backoff with jitter for AWS SDK calls.
 *
 * Extracted so both `embedQuestion` (Titan v2) and `completeBedrock`
 * (Claude 3.5 Sonnet) share one retry policy — mirrors the WI-005 ingest
 * embedder behavior (5 attempts, base 200 ms, cap 5 s, ±20% jitter).
 *
 * NOTE for dedup: `ingest/embedBedrock.ts` still carries its own private
 * copy; a follow-up WI should collapse both onto this helper.
 */

const RETRYABLE_NAMES = new Set([
  'ThrottlingException',
  'ServiceUnavailableException',
  'TooManyRequestsException',
])

export interface BackoffOptions {
  maxAttempts?: number
  baseDelayMs?: number
  capDelayMs?: number
  /** Called before each retry sleep (for logging/tests). */
  onRetry?: (attempt: number, delayMs: number, errorName: string) => void
}

export const DEFAULT_MAX_ATTEMPTS = 5
export const DEFAULT_BASE_DELAY_MS = 200
export const DEFAULT_CAP_DELAY_MS = 5_000

/**
 * Runs `fn` with bounded exponential backoff + jitter.
 * Retryable AWS error names (Throttling family) are retried; everything
 * else propagates immediately after the first attempt (fail fast).
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: BackoffOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const capDelayMs = opts.capDelayMs ?? DEFAULT_CAP_DELAY_MS

  let lastError: unknown = undefined
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const name = (err as { name?: string })?.name ?? 'Error'
      if (!RETRYABLE_NAMES.has(name) || attempt === maxAttempts) {
        throw err
      }
      const delay = Math.min(capDelayMs, baseDelayMs * 2 ** (attempt - 1))
      const jitter = delay * (1 + (Math.random() * 0.4 - 0.2))
      opts.onRetry?.(attempt, Math.round(jitter), name)
      await new Promise((resolve) => setTimeout(resolve, jitter))
    }
  }
  throw lastError
}
