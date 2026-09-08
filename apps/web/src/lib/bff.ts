/**
 * Browser-to-backend path helpers (BFF proxy).
 *
 * The `access_token` cookie is httpOnly (lib/oauth.ts), so client
 * components cannot attach `Authorization: Bearer` themselves. Instead of
 * calling the API host directly, client components call the same-origin
 * proxy route (`app/api/proxy/[...path]/route.ts`), which attaches the
 * Bearer token server-side from the cookie.
 *
 * Server Components keep calling `apiRequest` (lib/api-client.ts)
 * directly and never go through the proxy.
 */

/** Same-origin prefix every client-side API call starts with. */
export const BFF_PROXY_BASE = '/api/proxy'

/**
 * Map an API-spec path (e.g. `/chatbots/:id/documents`) onto the
 * same-origin proxy URL. Leading slashes are normalized; nothing outside
 * the proxy prefix is reachable through it.
 */
export function bffProxyPath(apiPath: string): string {
  const suffix = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  return `${BFF_PROXY_BASE}${suffix}`
}
