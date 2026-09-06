---
version: 1
slug: "apps-web-src-app-chat-chatbotid-page-tsx"
primary_target: "apps/web/src/app/chat/[chatbotId]/page.tsx"
related_targets: []
---

# Surface brief — /chat/[chatbotId] — the visitor chat

## Scope & visitor mode
The public visitor chat route `/chat/[chatbotId]` (`apps/web/src/app/chat/[chatbotId]/`), built in its own world: the **Ask-First Q&A Board** (direction seed key `fb7dfcd1`, contract carried in `layout.tsx`). Visitor mode: **Operate** — the visitor completes the task of getting grounded answers; this is not a persuasion or browsing surface.

## Audience, job, actions, proof
- **Audience:** anonymous website visitors, inside the company's own site (the iframe embed snippet) or arriving via a shared link.
- **Job:** ask a question and receive a grounded answer.
- **Actions:** ask (composer, Enter or the Ask button), read (the answer plus collapsible `Sources (n)`, capped at 3), retry (one automatic retry on transient failure, then a manual "Try again" at the failed card).
- **Proof/content:** the answer is grounded in the company's documents; each card footnotes the source chunks behind a collapsed disclosure so claims stay checkable.

## Constraints
- iframe-safe: fills the 480px embed frame and full-page view alike (`min-height: 100dvh`); works from 320px up; English copy only.
- No cookies, no auth, no persistence: every call sends `credentials: 'omit'`; the API-issued `conversation_id` lives in a React ref (memory only), never localStorage/sessionStorage, so a shared device never resumes a stranger's thread.
- Visitor copy never leaks internals: no status codes, no error classes, no backend strings, no company blame — `VISITOR_ERROR_COPY` (lib/chat-public.ts) is the single copy source.
- Untrusted text renders inert: answers and source chunks are plain text only; no `dangerouslySetInnerHTML` anywhere on this surface.

## Chosen direction & memorable moment
**Ask-First Q&A Board**: the composer leads, front and center, and every answered question becomes a small document card stacked beneath it — question as heading, grounded answer as body, sources footnoted to the same card. **Memorable moment:** the answer card assembling beneath the question — the grounded answer rises into place (260ms reveal) while the sources sit one fold away, opening on demand.

## Unresolved decisions (recorded deferred in WI-009)
- Customer branding/theming of the widget (out of MVP scope).
- Streaming/SSE answers (the WI-006 contract is synchronous; the thinking state covers the wait).
- Real rate-limit middleware on the public chat path (WI-006 accepts 429 passthrough as MVP risk; the client already renders 429 as calm visitor copy).
