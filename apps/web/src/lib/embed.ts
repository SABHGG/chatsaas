/**
 * The iframe generator (WI-007 Task 15): the exact string the operator
 * copies into their own site. The snippet is built from the chatbot's
 * public chat URL (the `url` field of the publish response and the
 * published list).
 *
 * SECURITY: the sandbox deliberately does NOT include
 * `allow-top-navigation` or `allow-popups`. The embedded widget may run
 * scripts and talk to its own origin (`allow-scripts allow-same-origin`),
 * but it must never be able to navigate the host page, resize it, or
 * spawn windows from it. Widening the sandbox widens the attack surface
 * of every customer site that pastes this snippet — keep it exactly this
 * narrow. `referrerpolicy` is pinned to `strict-origin-when-cross-origin`
 * so the host page's full URL never leaks to the chat origin.
 */

/**
 * The template the operator copies. `{{url}}` and `{{title}}` are the
 * interpolation slots; see {@link buildIframeSnippet}. The attribute set
 * is part of the security contract — `lib/embed.test.ts` asserts the
 * exact string and rejects any drift.
 */
export const IFRAME_SNIPPET_TEMPLATE = [
  '<iframe src="{{url}}" title="{{title}}" loading="lazy"',
  '  sandbox="allow-scripts allow-same-origin"',
  '  referrerpolicy="strict-origin-when-cross-origin"',
  '  style="border: 0; width: 100%; height: 480px;"></iframe>',
].join('\n')

/**
 * Escape a value for safe interpolation into a double-quoted HTML
 * attribute: ampersands first, then quotes. The public chat URL is
 * minted by our own API (base + chatbot id), but the builder stays safe
 * for any value that reaches it.
 */
function escapeHtmlAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

/** Build the exact snippet string the operator copies. */
export function buildIframeSnippet(url: string, title = 'chatSaaS chat'): string {
  return IFRAME_SNIPPET_TEMPLATE.replaceAll('{{url}}', escapeHtmlAttribute(url)).replaceAll(
    '{{title}}',
    escapeHtmlAttribute(title),
  )
}

/**
 * Copy text to the clipboard, with a legacy fallback for non-secure
 * contexts (plain http origins where `navigator.clipboard` is absent).
 * Returns whether the copy succeeded so the UI can play the patch-cord
 * click feedback only on a real copy (ADR-007 motion rule).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or unavailable — fall through to the legacy path.
    }
  }

  if (typeof document === 'undefined') return false

  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }
  document.body.removeChild(area)
  return copied
}
