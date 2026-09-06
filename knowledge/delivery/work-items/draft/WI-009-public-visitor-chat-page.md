---
type: feature
id: WI-009
title: "Public visitor chat page: the URL + iframe surface that publish hands out"
knowledge_level: K2
status: draft
phase: now
initiative: "RM-001"
domains:
  - "Public Chatbot Delivery"
created_at: "2026-09-04"
source: post-wi-007-founder-session
source_id: wi-009-public-visitor-chat-2026-09-04
source_title: "Public visitor chat page (the missing publish outcome)"
source_context: "Created at the founder's request after the Flight-Strip world landed. WI-001's end-to-end journey (completed) step 5 — a visitor opens the public URL or embedded iframe and receives a document-grounded answer — is the one unmet user-facing outcome. Verified today: publish returns PUBLIC_CHAT_BASE_URL/<chatbotId> and an iframe snippet, but no HTML page exists anywhere (chatPublic.ts is a Fastify JSON API; apps/web has no public route). The backend contract is fully built and tested by WI-006 (completed)."
source_initiative: "Public Document-Grounded Chatbot"
expected_value: "A visitor opens PUBLIC_CHAT_BASE_URL/<chatbotId> (directly or inside the operator's iframe snippet) and chats with the published, document-grounded chatbot: asks a question, receives the grounded answer with cited sources, keeps conversing via conversation_id, and sees honest, blame-free states when the bot is unavailable, rate-limited, or the company hit its plan limit. Mobile-first, iframe-safe, no login."
risks:
  - "**R-1 (CRITICAL) Prompt/chunk content rendered as HTML.** `sources[].content` and the assistant answer come from retrieved document chunks and a model completion — both are untrusted text from the page's perspective. Rendering them as HTML is a stored-XSS channel into the CUSTOMER'S WEBSITE (the iframe shares nothing, but the public URL is same-origin with chatSaaS). Mitigation: messages and sources render as plain text only (no dangerouslySetInnerHTML anywhere in the chat surface); a vitest asserts a chunk containing `<script>` renders inert."
  - "**R-2 (HIGH) Iframe embedding blocked by platform defaults.** The page MUST be embeddable cross-origin (the product's embed promise): no X-Frame-Options DENY/SAMEORIGIN on the chat route, CSP `frame-ancestors` permissive for MVP (configurable later). Middleware must not touch /chat/* (it currently guards /board only — keep it that way). The surface must be fully functional without third-party cookies (it is anonymous; the only client state is the conversation_id the API returns)."
  - "**R-3 (HIGH) Visitor-facing error copy leaks internals or blames the company.** 402 (plan/credit exhausted), 429 (rate limit), 404 (not published), 5xx must render as calm visitor copy ('This assistant is unavailable right now', 'The assistant reached its plan limit — please try again later') — never AWS/error-class strings, never 'the company didn't pay'. A single error-to-copy map in apps/web; the visitor never sees a status code."
  - "**R-4 (HIGH) No streaming + p95 8 s = dead window.** The message round-trip can take seconds; without feedback the visitor re-sends. Mitigation: an in-world 'thinking' state on send (disabled input, animated indicator), the send disabled while awaiting, and retry-once on transient failure. SSE/streaming stays out of scope (WI-006 contract)."
  - "**R-5 (MEDIUM) Conversation continuation abuse.** The client-supplied conversation_id is only honored when it belongs to this chatbot (server-verified in WI-006). The page treats it as opaque: never derives scope from it, stores it in memory (not localStorage) for MVP so a shared device does not resume a stranger's thread."
  - "**R-6 (MEDIUM) Unpublished / zero-docs bot is reachable by URL.** The public GET returns 404 for non-published ids and the chat handler returns the configured fallback answer for zero retrieval rows. The page renders both honestly: neutral 'not available' for the former; the API's fallback answer text stands as the zero-docs reply (no client-side pretending)."
  - "**R-7 (LOW) Public GET surface minimalism.** `GET /api/public/chatbots/:chatbotId/config` returns only {chatbotId, name, status}. The header uses that name; NO company name, plan, or document metadata is exposed on the public path (tenant privacy)."
dependencies:
  - "WI-006 (completed) — the public chat contract: POST /api/public/chat/:chatbotId/message {message, conversation_id?} → {answer, conversation_id, sources[]}; 402 limits/credits, 404 unpublished, 429 rate limit; server rebuilds rolling context (last N=4 turns); no streaming. (Verified on the real mount: the public config GET is GET /api/public/chatbots/:chatbotId/config, not /api/public/chat/:id.)"
  - "WI-002 (completed) — chatbotsPublic plugin: public GET returns {chatbotId, name, status:'published'} or null for non-published; anonymous, no auth hook."
  - "WI-007 (completed) — the operator board; IFRAME_SNIPPET_TEMPLATE already hands the visitor URL this WI must serve. The operator surfaces are DONE and out of scope here."
  - "WI-004 (ready) — deploy topology only; the page consumes the API through the same BFF/proxy pattern as the board (no direct Lambda calls from the visitor page)."
  - "PRODUCT.md — English copy; grounded honesty (fallback answer when documents lack the answer); never leak AWS/cloud terminology to visitors."
  - "Visual world: the VISITOR surface deliberately does NOT inherit the operator's Flight-Strip Control Board world — different audience (the visitor is inside the COMPANY's website context). A quiet, neutral, mobile-first chat surface with its own minimal token set; recorded as a surface brief at finish."
code:
  - "apps/web/src/app/chat/[chatbotId]/page.tsx (new — public server component: fetches public GET, renders not-published state or the chat shell)"
  - "apps/web/src/app/chat/[chatbotId]/chat-client.tsx (new — client island: message list, composer, thinking state, retry, sources disclosure)"
  - "apps/web/src/lib/chat-public.ts (new — typed fetch wrapper for POST message + public GET; error-class → visitor copy map; no cookies, no auth)"
  - "apps/web/src/app/chat/[chatbotId]/page.test.tsx (new — states: not published, ready, 402, 429, network error + retry, plain-text rendering of malicious chunk)"
  - "apps/web/e2e/public-chat.spec.ts (new — mock path: publish flow → open public URL → ask grounded question → answer + sources render → second turn continues conversation_id)"
  - "apps/web/src/lib/embed.ts (verify only — snippet must keep pointing at the URL this WI serves)"
  - "apps/web/src/middleware.ts (verify — matcher must continue to exclude /chat/*)"
  - "knowledge/delivery/work-items/draft/WI-009-public-visitor-chat-page.md (this file, once implemented)"
---

# WI-009: Public visitor chat page

## Goal

Serve the surface the product promises: after publish, the operator receives a public URL and an
iframe snippet; this WI makes both land on a real page where an anonymous visitor asks questions and
receives document-grounded answers. It is the visitor half of the product journey — the operator's
board (WI-007) hands off here.

The visitor surface is deliberately its own quiet, neutral, mobile-first chat — it renders inside
the customer's website (iframe) or as a shared URL, and must feel like the COMPANY's assistant,
not like chatSaaS's operator tooling. No rack/stamp vocabulary, no Cognito, no cookies.

## Scope

**In scope:**

- `apps/web` public route `/chat/[chatbotId]`: server shell + client chat island, mobile-first,
  works full-viewport and inside the shipped iframe snippet.
- Typed client for the two public endpoints: `GET /api/public/chatbots/:chatbotId/config`
  (name/status) and
  `POST /api/public/chat/:chatbotId/message` (message, optional conversation_id) with the
  error-class → visitor-copy map.
- Conversation states: idle greeting, sending/thinking (disabled composer), answered (answer +
  collapsible sources count/list), multi-turn via conversation_id (memory only, not persisted).
- Honest states: not-published/unknown (404), plan limit reached (402), rate limit (429),
  network error with retry-once, API fallback answer rendered verbatim for zero-docs bots.
- Plain-text-only rendering of messages and sources; document citations as source snippets, never
  interpreted HTML.
- Iframe-embedding: no X-Frame-Options on this route; CSP frame-ancestors left permissive for
  MVP; no third-party cookies; page fills the iframe viewport.
- Vitest coverage of every state + the XSS-inertness test; a public-chat e2e on the mock path.
- Surface brief for the visitor chat recorded at finish (impeccable flow, surface scope).

**Out of scope (explicitly):**

- Streaming/SSE responses (WI-006 contract is synchronous; streaming is a follow-up WI).
- Customer branding/theming of the widget, custom greetings per chatbot, JS-widget distribution
  (business.md MVP exclusions).
- Operator-side chat transcript views, analytics, abuse signals (separate WIs).
- Any backend change: the chat API, metering, limits, and public GET are DONE (WI-006).
- Real-rate-limit middleware (WI-006 documents 429 passthrough as accepted MVP risk).

## Acceptance Criteria

1. `PUBLIC_CHAT_BASE_URL/<published-id>` renders a mobile-first chat page showing the chatbot's
   name from the public GET; an unpublished or unknown id renders the neutral "not available"
   state (no stack traces, no status codes).
2. An anonymous visitor can send a message and receive the grounded answer; each answer exposes
   its sources in a collapsed block (plain text, capped, inert); a follow-up question continues
   the conversation via the returned conversation_id.
3. The composer disables while awaiting a reply and shows a thinking state; a transient failure
   retries once automatically, then offers a manual retry; no message is silently dropped.
4. Plan-limit (402) and rate-limit (429) render the calm visitor copy ("reached its plan limit" /
   "too many messages, try again shortly") — never an error class, status code, or company blame.
5. Messages and sources render as plain text: a chunk containing `<script>` or an `<img onerror>`
   renders inert (vitest-proven).
6. The page embeds in the existing iframe snippet: no frame-blocking headers on /chat/*, no cookie
   dependency, responsive from 320 px up; the middleware matcher still excludes /chat/*.
7. The visitor surface carries its own minimal neutral visual system (NOT the operator's
   Flight-Strip world), documented in a surface brief at finish; English copy throughout.
8. `pnpm -F web type-check`, `pnpm -F web lint`, `pnpm -F web test` green; `pnpm -F web build` green;
   the new e2e public-chat happy path passes against the mock backend; `kaddo guard` returns
   0 findings.

## Tasks

1. **T-01 — Contract pins.** Type the two public endpoints in `apps/web/src/lib/chat-public.ts`
   (zod-validated responses, no cookies, no auth headers); visitor copy map for
   error_class/status. Estimate: S.
2. **T-02 — Route + server shell.** `/chat/[chatbotId]/page.tsx`: public GET, not-published
   state, metadata (title), document top composition. Estimate: S.
3. **T-03 — Chat client island.** Message list (user/assistant roles), composer with
   send/thinking/disabled states, retry-once, sources disclosure, conversation_id in memory.
   Depends on T-01. Estimate: M.
4. **T-04 — Visitor visual language.** Minimal neutral surface (own tokens, light, mobile-first,
   no operator-world borrowings), accessible focus/keyboard, reduced-motion respect. Depends on
   T-03. Estimate: M.
5. **T-05 — Iframe readiness.** Verify no frame-blocking headers/CSP on /chat/*, snippet
   round-trip on the mock path, height/scroll behavior inside a 100%-height iframe.
   Depends on T-03. Estimate: S.
6. **T-06 — Vitest suites.** Page states, copy map, XSS-inert rendering, composer states.
   Depends on T-03. Estimate: M.
7. **T-07 — e2e public-chat happy path.** Publish (mock) → open public URL → grounded answer →
   second turn; plus the 402 state with an exhausted-credits mock. Depends on T-03. Estimate: M.
8. **T-08 — Surface brief + DESIGN.md addition.** Visitor-surface brief (scope/mode/audience)
   and the DESIGN.md section for the visitor surface at finish. Depends on T-01..T-07. Estimate: S.

## Validation

- `pnpm -F web type-check`, `lint`, `test` green; `pnpm -F web build` green.
- e2e: publish → public URL → grounded answer → second turn (mock backend).
- Manual smoke in the sandbox: publish a bot, open the returned public URL, ask a document
  question, verify grounded answer + sources; paste the iframe snippet into a blank HTML page and
  repeat.
- `kaddo guard` 0 findings; `kaddo questions` surfaces no new blocking question.
- Recommended: finish review via the Impeccable surface flow (new surface inside the committed
  repo; visitor world decided at its surface brief, not by the operator world).

## Open Questions

All product decisions below are recorded as explicit assumptions (Kaddo: assumed, not silent).
None is blocking; flip any to `[resolved]` with the founder's word and the WI follows.

1. **[assumed] Visitor world ≠ operator world.** The public chat ships its own quiet, neutral,
   mobile-first surface (no Flight-Strip rack vocabulary) because visitors see it inside the
   company's own site; the operator world would be wrong there. Note: customer-facing theming is
   a follow-up; MVP ships one neutral look.
2. **[assumed] Greeting.** With no welcome-message field in the product, the idle state greets:
   "Hi! Ask anything about {company/chatbot name}." — derived from the public GET name, no new
   backend field.
3. **[assumed] conversation_id lives in memory only for MVP** (no resume across reloads) to
   avoid cross-visitor continuation on shared devices; persistence is a follow-up.
4. **[deferred] Streaming (SSE)** stays out — the WI-006 contract is synchronous; the thinking
   state covers the wait.
5. **[deferred] Customer branding/white-label of the widget** — out of MVP scope.

## Sister WIs and dependency graph

- WI-006 (completed) → this WI (the chat contract consumed).
- WI-007 (completed) → hands off: publish output (public URL + iframe snippet) is this WI's entry point.
- WI-004 (ready) → deploy-time only (domain for PUBLIC_CHAT_BASE_URL; CSP frame-ancestors at the edge).
- This WI completes WI-001's acceptance criteria end to end.
