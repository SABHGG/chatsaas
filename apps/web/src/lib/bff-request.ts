import { apiRequest, type ApiRequestOptions } from './api-client'
import { bffProxyPath } from './bff'

/**
 * Client-side API call through the same-origin BFF proxy.
 *
 * Client components cannot call the API host directly: the `access_token`
 * cookie is httpOnly (lib/oauth.ts), so only this app's proxy route can
 * attach `Authorization: Bearer`. `proxyRequest` routes an API-spec path
 * (e.g. `/chatbots/:id/publish`) through `/api/proxy/...`, which also
 * enforces the CSRF header on mutations (R-7) — never bypass it by
 * calling `apiRequest` with an absolute API URL from the browser.
 *
 * The `accessToken` option is deliberately not exposed: the browser never
 * holds a bearer token; the proxy injects it server-side.
 */
export function proxyRequest<TData>(
  apiPath: string,
  options: Omit<ApiRequestOptions<TData>, 'baseUrl' | 'accessToken'>,
): Promise<TData> {
  return apiRequest(bffProxyPath(apiPath), { ...options, baseUrl: '' })
}
