import type { ZodType } from 'zod'
import { ApiError, apiErrorBodySchema, asApiError, toOperatorMessage } from './api-errors'

/**
 * Typed fetch wrapper for the admin API (knowledge/tech/api-spec.md).
 *
 * Contract encoded here:
 * - Success responses are JSON with a `data` field; the caller supplies a
 *   Zod schema for `data` and gets the parsed, typed value back.
 * - Error responses are `{ error, details?, path?, timestamp? }`; every
 *   failure is surfaced as an {@link ApiError} whose message is already in
 *   operator language — HTTP 429 renders the line-vocabulary string
 *   "On hold" (ADR-007).
 * - Every mutation carries `X-Requested-With: XMLHttpRequest` (R-7, CSRF).
 *
 * The wrapper is environment-agnostic (no next/headers import) so it can
 * run in client components and the edge alike. Server components pass the
 * access token via `accessToken` (see `lib/auth.ts`); browser callers rely
 * on same-origin cookies.
 */

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api').replace(/\/+$/, '')

/** Line vocabulary + method kinds that count as mutations for CSRF. */
type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface ApiRequestOptions<TData> {
  /** HTTP method. Defaults to GET. */
  method?: HttpMethod
  /** JSON-serializable request body (ignored for GET). */
  body?: unknown
  /** Zod schema validating the response envelope's `data` field. */
  dataSchema: ZodType<TData>
  /** Extra headers (merged after the defaults; overrides win). */
  headers?: Record<string, string>
  /** Bearer token for server-side callers (optional). */
  accessToken?: string | null
  /** AbortSignal passthrough. */
  signal?: AbortSignal
  /** Override the configured API base URL (tests). */
  baseUrl?: string
}

function joinUrl(base: string, path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

export async function apiRequest<TData>(path: string, options: ApiRequestOptions<TData>): Promise<TData> {
  const {
    method = 'GET',
    body,
    dataSchema,
    headers = {},
    accessToken,
    signal,
    baseUrl = API_BASE_URL,
  } = options

  const isMutation = method !== 'GET'

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(isMutation ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
    ...(body !== undefined && isMutation ? { 'Content-Type': 'application/json' } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...headers,
  }

  let response: Response
  try {
    response = await fetch(joinUrl(baseUrl, path), {
      method,
      headers: requestHeaders,
      body: body !== undefined && isMutation ? JSON.stringify(body) : undefined,
      credentials: 'include',
      signal,
    })
  } catch (err) {
    throw asApiError(err)
  }

  if (!response.ok) {
    throw await toApiError(response)
  }

  // Success envelope: { data: ... } (spec "Common Responses").
  let parsedBody: unknown
  try {
    parsedBody = await response.json()
  } catch {
    throw new ApiError(response.status, 'PARSE_ERROR', toOperatorMessage(500))
  }

  if (typeof parsedBody !== 'object' || parsedBody === null || !('data' in parsedBody)) {
    throw new ApiError(response.status, 'PARSE_ERROR', toOperatorMessage(500))
  }

  const result = dataSchema.safeParse((parsedBody as { data: unknown }).data)
  if (!result.success) {
    throw new ApiError(response.status, 'PARSE_ERROR', toOperatorMessage(500), result.error.issues)
  }

  return result.data
}

/** Build the operator-facing ApiError from a non-2xx response. */
async function toApiError(response: Response): Promise<ApiError> {
  let code: string | undefined
  let details: unknown

  try {
    const body = apiErrorBodySchema.safeParse(await response.json())
    if (body.success) {
      // The real backend puts the machine code in `code` and a human
      // sentence in `error`; the spec puts the code in `error`. Either
      // way the value is only ever a code HINT — the operator copy is
      // chosen from the status line, never shown raw.
      code = body.data.code ?? body.data.error
      details = body.data.details
    }
  } catch {
    // Non-JSON error body: fall through to the status-based message.
  }

  return new ApiError(response.status, code ?? toErrorCode(response.status), toOperatorMessage(response.status, code), details)
}

function toErrorCode(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR'
    case 401:
      return 'AUTHENTICATION_ERROR'
    case 403:
      return 'AUTHORIZATION_ERROR'
    case 404:
      return 'NOT_FOUND_ERROR'
    case 429:
      return 'RATE_LIMIT_ERROR'
    default:
      return 'SERVER_ERROR'
  }
}

/** Convenience helpers. Callers keep passing their own `dataSchema`. */
export function apiGet<TData>(path: string, dataSchema: ZodType<TData>, options?: Omit<ApiRequestOptions<TData>, 'method' | 'dataSchema'>) {
  return apiRequest(path, { ...options, method: 'GET', dataSchema })
}

export function apiPost<TData>(path: string, dataSchema: ZodType<TData>, options?: Omit<ApiRequestOptions<TData>, 'method' | 'dataSchema'>) {
  return apiRequest(path, { ...options, method: 'POST', dataSchema })
}

export function apiPatch<TData>(path: string, dataSchema: ZodType<TData>, options?: Omit<ApiRequestOptions<TData>, 'method' | 'dataSchema'>) {
  return apiRequest(path, { ...options, method: 'PATCH', dataSchema })
}

export function apiDelete<TData>(path: string, dataSchema: ZodType<TData>, options?: Omit<ApiRequestOptions<TData>, 'method' | 'dataSchema'>) {
  return apiRequest(path, { ...options, method: 'DELETE', dataSchema })
}
