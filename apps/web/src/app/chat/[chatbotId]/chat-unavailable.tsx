/**
 * The neutral "not available" state (WI-009 AC 1, R-6): rendered for an
 * unknown id, an unpublished chatbot, or an unreachable backend — the
 * same calm surface for all of them, with no status codes, no stack
 * traces, and no tenant internals. It states the fact and one honest
 * possibility, and blames nobody.
 */
export function ChatUnavailable() {
  return (
    <main className="vchat-unavailable" data-testid="visitor-unavailable">
      <div className="vchat-unavailable-inner">
        <h1>This assistant isn&rsquo;t available right now.</h1>
        <p>The link may be out of date, or the assistant may no longer be published.</p>
      </div>
    </main>
  )
}
