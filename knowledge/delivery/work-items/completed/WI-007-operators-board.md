---
type: feature
id: WI-007
title: "Operator's Board: app router, jose auth, 4-step wizard, dashboard, meters, publish/unpublish, iframe generator"
knowledge_level: K2
status: completed
phase: now
branch: feature/WI-007-operators-board
initiative: "RM-001"
created_at: "2026-08-28"
source: post-wi-003-decisions
source_id: post-wi-007-operator-board-2026-08-28
source_title: "Frontend Operator's Board for chatSaaS"
source_context: "Derived from the post-WI-003 decision set (Q3 ordered as Infra/CDK → Bedrock+RAG → Frontend; the third tier is this WI). WI-007 is the user-facing surface that consumes WI-005 (upload), WI-006 (chat), and WI-008 (auth). It is grounded in the canonical visual world committed in ADR-007 (The Operator's Board — ivory/slate/Patch Amber, jack-and-plug geometry, line-vocabulary states) and the canonical design seed in apps/web/DESIGN.md. Per ADR-007 §Implementation Path, the existing blue Spanish scaffold in apps/web/src/ is treated as evidence of the category rut, not authority, and must be reconstructed in the Operator's Board world. The duplicate component folders (apps/web/src/components/ and apps/web/src/app/(dashboard)/components/) must be deduplicated in this WI."
source_initiative: "Public Document-Grounded Chatbot"
expected_value: "A runnable Operator's Board at apps/web/ that the small-business owner actually uses. It covers: (1) OAuth code+PKCE against the Cognito User Pool from WI-008 (jose 5.x validates the ID/access token in a Next.js 16 App Router middleware), (2) the canonical 4-step wizard from DESIGN.md (name → documents → review → publish) built as a single vertical column that does not shift between steps, (3) the 'Your lines' board where each chatbot reads as a jack with a line-state indicator (unplugged / connecting / live / on hold), (4) the plan + prepaid-credits meter with the 80%-alert and 100%-block invariant from business.md surfaced as a line-state label, (5) the publish/unpublish controls (the 'plug'), (6) the iframe snippet generator (jack label that copies to clipboard with the 'patch-cord' click animation per ADR-007 motion rule), and (7) Zustand-persisted wizard draft that survives a refresh. All UI follows the three named rules in ADR-007 (Live Line, Jack Label, Flat-by-Default). All copy in English per PRODUCT.md. Exact tokens (hex codes, font families, radius scale) are decided during implementation and carbonized into DESIGN.md by the impeccable scan step at build finish — they are not committed in this WI."
risks:
  - "**R-1 (CRITICAL) Visual drift into the generic blue SaaS dashboard.** The existing apps/web/src/ scaffold was built before ADR-007 in the blue SaaS rut (blue-600, gray cards, Spanish copy). The CONSTRUCTION LANGUAGE in ADR-007 §Consequences says: 'The previous scaffold is treated as evidence of the category rut, not authority. It must be reconstructed in the Operator's Board before WI-001 implementation'. Mitigation: this WI does NOT extend the existing scaffold; it replaces it. The new scaffold lives under apps/web/src/app/(board)/ and apps/web/src/components/, and the old files are deleted in the same work unit. The kaddo guard includes a check that no `bg-blue-600`, `text-blue-*`, or Spanish copy strings remain in the tree at WI completion."
  - "**R-2 (HIGH) Cognito hosted UI callback mishandling on App Router.** The OAuth code+PKCE flow starts at WI-008's hosted UI and lands on /api/auth/callback (the App Router route) which must exchange the code for tokens via @aws-sdk/client-cognito-identity-provider, set HTTP-only secure cookies (id_token, access_token, refresh_token), validate them with jose 5.x, and redirect to the originally-requested URL. Mistakes here leave the operator stuck at the callback. Mitigation: a vitest route test covers the full happy path + the error path (invalid code, expired code, state mismatch); the route handler is the only code that talks to the Cognito token endpoint."
  - "**R-3 (HIGH) Wizard draft loss on refresh.** Operators fill step 1 (name), then get interrupted, come back, and find a blank form. This is the exact class of regression Impeccable's design system prevents by giving every state a place, but the implementation is the operator's job. Mitigation: the wizard state lives in a Zustand store with the `persist` middleware against `localStorage` under a `chatsaas:draft:<operatorId>:<chatbotId>` key. SSR hydration is gated by `useEffect` and a `useHydrated` flag to avoid a hydration mismatch. A vitest test simulates a full reload between every step and asserts the draft is restored."
  - "**R-4 (HIGH) Document upload UX pitfalls.** A 10 MB PDF upload can sit on the wire long enough for the operator to think it's stuck; a failed upload can leave a half-finished chatbot; an upload to a chatbot whose ingest is broken (DC-005-1 unresolved) needs a clear operator-visible message. Mitigation: the upload widget shows progress (XHR upload progress events), retries once on transient network failure, and surfaces the backend's structured error (`error_class: 'ParseError' | 'TenantUnresolved' | 'Throttling'` etc.) in plain operator language. The wizard step 2 MUST be navigable even if some documents are in `failed` state — the operator can fix and re-upload."
  - "**R-5 (MEDIUM) Publish before ingest is ready.** The 4-step wizard ends with 'Publish' which is the moment the jack goes amber. If the operator publishes a chatbot with zero `ready` documents, the live widget will answer 'I don't have information about that yet' for every question. Mitigation: the publish step in the wizard shows a readiness indicator (X of Y documents ready) and the publish button is disabled until at least 1 document is `ready`. The operator can override (with a confirmation dialog explaining the trade-off) — but the default is the safe path. The published-but-no-documents state is a valid `live` line state and renders a clear label."
  - "**R-6 (MEDIUM) Iframe snippet security.** The snippet is rendered as a copyable block of HTML that loads the public chat from the customer's published URL. A naive snippet (no `sandbox`, no `referrerpolicy`, no `allow=""` whitelist) can be abused. Mitigation: the snippet template is versioned in a constant (`IFRAME_SNIPPET_TEMPLATE` in `apps/web/src/lib/embed.ts`) and includes `sandbox=\"allow-scripts allow-same-origin\"`, `referrerpolicy=\"strict-origin-when-cross-origin\"`, `loading=\"lazy\"`, and the right `src`. The vitest asserts the exact string the customer copies. A SECURITY note in the file states the safety boundaries (the sandbox does NOT include `allow-top-navigation` or `allow-popups`)."
  - "**R-7 (MEDIUM) CSRF on admin mutations.** Fastify's same-origin / CORS layer is on the API side; the App Router's Server Actions (or fetch wrappers) must not silently trust the cookie alone. Mitigation: every admin mutation carries an `X-Requested-With: XMLHttpRequest` header (CSRF defense in depth); the API rejects requests without it. The vitest for `chatbotsCreate`, `chatbotsPatch`, `documentsUpload`, `chatbotsPublish` asserts the 403 path when the header is missing."
  - "**R-8 (MEDIUM) Zustand store hydration race with Server Components.** The wizard store reads from localStorage on the client, but the wizard pages can be rendered as Server Components for the static parts (the 'Your lines' board reads from the API). Mixing them needs a `useHydrated` guard so the Server Component HTML matches the first client render. Mitigation: a `useHydrated` hook is committed in this WI; any store-consuming component wraps its client-only render in it. A vitest using `renderHook` asserts that `useHydrated` returns false on the first server pass and true on the first client pass."
  - "**R-9 (LOW) Rate limit visibility.** A 429 from the API surfaces as 'on hold' on the meter (matches the line vocabulary) with a clear human explanation. The operator should never see a raw '429 Too Many Requests' string. Mitigation: a single error-to-message map in `apps/web/src/lib/api-errors.ts`; the API client uses it on every error path. The vitest asserts that a mocked 429 renders the 'on hold' label."
  - "**R-10 (LOW) Direct URL bypass of wizard steps.** The operator can hit `/board/wizard/documents` directly without going through step 1. Mitigation: the wizard layout reads the Zustand store and redirects to step 1 if `step1.name` is empty. The redirect happens in a Server Component (no flash)."
dependencies:
  - "WI-002 / WI-002b / WI-003 (completed) — the Fastify API and Cognito JWT verifier this WI calls."
  - "WI-004 (ready) — RDS Proxy + Aurora — only relevant at deploy; the app talks to the API, not Aurora directly."
  - "WI-005 (draft) — the upload contract (`POST /api/chatbots/:chatbotId/documents` multipart, 10 MB, PDF/DOCX/TXT/MD; Document.status state machine)."
  - "WI-006 (draft) — the chat contract (`POST /api/public/chat/:chatbotId/message`). The Operator's Board uses the API directly; the public widget consumed by the customer's visitors is OUT of scope here."
  - "WI-008 (draft) — the Cognito User Pool; the App Router middleware trusts the issuer URL and the `custom:company_id` claim from this WI's auth flow. THIS WI IS THE PRIMARY CONSUMER OF WI-008."
  - "ADR-001 (Cognito) — OAuth code+PKCE."
  - "ADR-003 (Technology Stack) — Next.js 16 (App Router), React 19, Tailwind 4.3, Radix primitives, Zustand 5.x, jose 5.x, @aws-sdk/client-cognito-identity-provider, zod 3.x, vitest 3.x, @testing-library/react 16.x."
  - "ADR-005 (Cost Attribution and Billing) — 80%/100% thresholds the meter surfaces."
  - "ADR-007 (Visual Design System, 2026-08-24) — The Operator's Board world; this WI implements it."
  - "PRODUCT.md — English copy commitment; English-language UI for MVP."
  - "`@aws-sdk/client-cognito-identity-provider` — token exchange; `jose` 5.x — JWT verification in middleware; `zustand` 5.x — wizard store."
code:
  - "apps/web/src/app/(board)/layout.tsx (new — shell of the Operator's Board, ivory ground, slate ink, slot for the 'Your lines' title)"
  - "apps/web/src/app/(board)/page.tsx (new — server-rendered 'Your lines' board: fetches the company's chatbots from GET /api/chatbots and renders them as jack cards with line-state labels)"
  - "apps/web/src/app/(board)/wizard/layout.tsx (new — wizard shell, header with the 4-step indicator that reads as 'panel' positions)"
  - "apps/web/src/app/(board)/wizard/page.tsx (new — Step 1: name, redirects to /wizard/documents on success)"
  - "apps/web/src/app/(board)/wizard/documents/page.tsx (new — Step 2: drag-and-drop upload, document list with status pills, retry on failure)"
  - "apps/web/src/app/(board)/wizard/review/page.tsx (new — Step 3: readiness indicator, document list, settings summary, plan picker)"
  - "apps/web/src/app/(board)/wizard/publish/page.tsx (new — Step 4: the patch-cord 'plug-in' moment, animation, transitions the chatbot to status=published)"
  - "apps/web/src/app/(board)/chatbots/[id]/page.tsx (new — single chatbot detail: status, document list, meter, publish/unpublish, iframe generator)"
  - "apps/web/src/app/(board)/plan/page.tsx (new — plan + credits view, prepayment flow button)"
  - "apps/web/src/app/api/auth/callback/route.ts (new — OAuth code+PKCE exchange, sets HTTP-only secure cookies, redirects)"
  - "apps/web/src/app/api/auth/logout/route.ts (new — clears cookies, redirects to login)"
  - "apps/web/src/middleware.ts (new — jose 5.x JWT verification on /board/*, redirects to /login if invalid; reads the issuer URL and JWKS from WI-008 stack outputs at deploy time)"
  - "apps/web/src/lib/api-client.ts (new — typed fetch wrapper, Zod-validated responses, the X-Requested-With header on mutations, error-to-message map)"
  - "apps/web/src/lib/auth.ts (new — server-side helpers: getSession(), getCompanyId(), requireSession(); reads cookies via next/headers)"
  - "apps/web/src/lib/embed.ts (new — IFRAME_SNIPPET_TEMPLATE constant + copyToClipboard helper)"
  - "apps/web/src/lib/use-hydrated.ts (new — SSR hydration guard hook)"
  - "apps/web/src/components/jack-card.tsx (new — the labeled jack row, line-state indicator, plug animation on publish)"
  - "apps/web/src/components/line-state-pill.tsx (new — unplugged/connecting/live/on-hold state labels in line vocabulary)"
  - "apps/web/src/components/usage-meter.tsx (new — plan + credits visualization, 80%/100% thresholds surface as 'on hold' label)"
  - "apps/web/src/components/stepper.tsx (new — 4-step indicator, current step in Patch Amber)"
  - "apps/web/src/components/wizard-store.ts (new — Zustand store, persist middleware on localStorage with chatsaas:draft:<operatorId>:<chatbotId> key, actions: setName, addDocument, removeDocument, goToStep, reset)"
  - "apps/web/src/components/file-dropzone.tsx (new — drag-and-drop, XHR upload progress, retry on transient network failure)"
  - "apps/web/src/components/__tests__/jack-card.test.tsx"
  - "apps/web/src/components/__tests__/line-state-pill.test.tsx"
  - "apps/web/src/components/__tests__/usage-meter.test.tsx"
  - "apps/web/src/components/__tests__/stepper.test.tsx"
  - "apps/web/src/components/__tests__/wizard-store.test.tsx (full persistence across simulated reloads)"
  - "apps/web/src/components/__tests__/file-dropzone.test.tsx"
  - "apps/web/src/app/api/auth/callback/__tests__/route.test.ts"
  - "apps/web/src/app/(board)/__tests__/wizard-flow.test.tsx (Playwright-style e2e happy path: name → upload mock → review → publish)"
  - "apps/web/DESIGN.md (modified — carbonize the actual tokens used at the end of the WI per ADR-007 §Implementation Path step 5)"
  - "apps/web/.env.example (modified — NEXT_PUBLIC_API_BASE_URL, NEXT_PUBLIC_CHATBOT_PUBLIC_URL, COGNITO_ISSUER_URL, COGNITO_CLIENT_ID, COGNITO_REDIRECT_URI)"
  - "apps/web/tailwind.config.ts (modified — Patch Amber, Operator's Ivory, Slate Ink, Hairline Slate tokens, jack-and-plug radius scale)"
  - "apps/web/src/app/globals.css (modified — the typography scale, the focus ring, the dark-mode class hooks if implemented)"
  - "apps/web/README.md (modified — how to run dev, how to point at a local Fastify, how the OAuth flow works)"
  - "knowledge/delivery/work-items/draft/WI-007-operators-board.md (this file, once promoted)"
  - "tasks/WI-007-operators-board-tasks.yml (new — task list, format mirrored on tasks/WI-004)"
---

# WI-007: The Operator's Board

## Goal

The Operator's Board is the only surface the customer ever sees. The non-technical small-business owner plugs a customer's question into their knowledge by connecting two jacks, and the line goes live. This WI builds that surface: the 4-step wizard that creates a chatbot from documents, the "Your lines" board that lists them, the meter that reads the operator's plan and credit position in line vocabulary, the publish/unpublish controls, and the iframe snippet the operator copies into their own site.

The board is grounded in the canonical world committed in ADR-007: ivory ground, slate ink, Patch Amber rationed to the live line and the primary create/publish control, jack-and-plug geometry, line-vocabulary states (unplugged / connecting / live / on hold), flat by default with the only elevation at the moment a line is plugged in, English copy per PRODUCT.md. Per ADR-007 §Implementation Path, the existing blue Spanish scaffold is treated as evidence of the category rut, not authority — this WI replaces it.

## Scope

**In scope:**

- The complete App Router shell: `(board)/layout.tsx`, `(board)/page.tsx`, `(board)/wizard/{page,documents,review,publish}/page.tsx`, `(board)/chatbots/[id]/page.tsx`, `(board)/plan/page.tsx`, `api/auth/{callback,logout}/route.ts`, `middleware.ts`.
- The jose 5.x middleware that validates the Cognito ID/access token from the cookies and redirects to `/login` if invalid; reads the issuer URL and JWKS from WI-008's stack outputs.
- The OAuth code+PKCE flow against WI-008's hosted UI; the callback route exchanges the code for tokens, sets HTTP-only secure cookies (`id_token`, `access_token`, `refresh_token`), and redirects to the originally-requested URL.
- The Zustand-persisted wizard draft that survives a refresh (`chatsaas:draft:<operatorId>:<chatbotId>` key, `useHydrated` guard, server-side redirect when a step is reached without the previous step's data).
- The 4-step wizard in the operator's plain language, with steps that occupy the same vertical space (no shift between steps) per DESIGN.md.
- The "Your lines" board (Server Component) that fetches the company's chatbots and renders them as jack cards with line-state indicators; reads from the API directly (no client-side fetch for the initial paint).
- The plan + credits meter that surfaces the 80%-alert and 100%-block invariant from business.md as a line-state label.
- Publish / unpublish controls (the "plug" — Patch Amber, with the click animation per ADR-007 motion rule).
- The iframe snippet generator (`IFRAME_SNIPPET_TEMPLATE` constant) with the security hardening (sandbox, referrerpolicy, lazy loading).
- The CSRF guard: every admin mutation carries `X-Requested-With: XMLHttpRequest`; the API rejects requests without it.
- The duplicate-components dedup from ADR-007 §Consequences: the two folders `apps/web/src/components/` and `apps/web/src/app/(dashboard)/components/` are reconciled into one.
- Tailwind 4.3 tokens decided at implementation time and committed in `apps/web/tailwind.config.ts` (Patch Amber, Operator's Ivory, Slate Ink, Hairline Slate, jack-and-plug radius scale).
- The vitest suite (components, store, route handlers) plus the Playwright e2e for the wizard happy path.
- Carbonizing the real tokens into `apps/web/DESIGN.md` per ADR-007 §Implementation Path step 5 (`/impeccable document` at build finish).
- English copy in all UI surfaces per PRODUCT.md.

**Out of scope (explicitly):**
- The visitor-side public chat widget (the snippet generated for the operator IS the visitor-side surface; rendering it as a React component in another customer's app is a follow-up).
- Real-time ingest status (SSE/WebSocket). The wizard polls `GET /api/documents/:documentId` every 5 s while a document is in `uploaded` or `processing`; a real push is a follow-up.
- Multi-user / team management (one operator per company for MVP; team invites are a follow-up).
- A billing checkout flow (read-only plan + credits view is IN; payment is a separate WI; the prepayment button is a placeholder that opens a modal saying "Contact us" for MVP).
- Hosted UI customization (we use WI-008's default; theming is a follow-up).
- Dark mode. ADR-007 commits light/ivory as the default and explicit 'not dark mode as default' rationale; dark is a follow-up.
- Lighthouse-perfect scores on every page. We commit: wizard happy path < 2.5 s LCP on a fresh load with one published chatbot, accessibility WCAG 2.1 AA on the wizard, all forms keyboard-navigable. Perfection is a follow-up.
- Internationalization. English copy per PRODUCT.md; localization is a follow-up.

## Acceptance Criteria

1. `pnpm -F web build` produces a deployable Next.js bundle; the `Your lines` page is a Server Component that renders the company's chatbots from the API on first paint.
2. The OAuth code+PKCE flow works end-to-end against WI-008's hosted UI: operator clicks 'Sign in', lands on Cognito, comes back to `/api/auth/callback`, gets redirected to the originally-requested URL with HTTP-only secure cookies set.
3. `apps/web/src/middleware.ts` validates the JWT with jose 5.x on every `/board/*` request; an invalid/expired token redirects to `/login` with the original URL as `?next=`.
4. The 4-step wizard (name → documents → review → publish) occupies the same vertical space across steps; the stepper at the top reads in Patch Amber on the current step; the 'Back' / 'Next' controls are out of Patch Amber.
5. The wizard draft survives a full page reload at any step (Zustand `persist`); a `useHydrated` guard prevents a Server Component / client mismatch; a direct URL hit on `/wizard/documents` without step-1 data redirects to `/wizard`.
6. Step 2 (documents) shows upload progress (XHR), retries once on transient network failure, surfaces the API's structured error in operator language; a file in `failed` state can be re-uploaded; the step is navigable with zero `ready` documents (the operator can proceed to step 3).
7. Step 3 (review) shows a readiness indicator (X of Y documents ready); the 'Continue' button is disabled when 0 documents are ready and the override requires a confirmation dialog explaining the trade-off.
8. Step 4 (publish) is the patch-cord 'plug-in' moment: Patch Amber takes over the active control, the jack on the board lights in the background, the iframe snippet becomes visible and copyable. A vitest asserts the exact string the operator copies.
9. The `Your lines` board renders each chatbot as a jack card with a line-state indicator (unplugged / connecting / live / on hold); the `live` indicator is the ONLY Patch Amber on the screen at rest; the primary 'New line' action is the OTHER place Patch Amber may appear.
10. The usage meter on the company plan page surfaces the 80%-alert (`Almost out of credits` in line vocabulary) and the 100%-block (`On hold`) from business.md; a 429 from the API renders the same 'on hold' label.
11. The iframe snippet has the exact security hardening (`sandbox=\"allow-scripts allow-same-origin\"`, `referrerpolicy=\"strict-origin-when-cross-origin\"`, `loading=\"lazy\"`); a vitest asserts the string.
12. Every admin mutation in `apps/web/src/lib/api-client.ts` sets `X-Requested-With: XMLHttpRequest`; the API returns 403 without it (asserted by a vitest for at least one mutation per resource).
13. The duplicate components folders are deduplicated: only `apps/web/src/components/` exists after this WI; the old `apps/web/src/app/(dashboard)/components/` folder is removed in the same work unit.
14. No `bg-blue-*`, no Spanish copy strings, no `rounded-md` generic radius remain in the tree at WI completion (a `grep` check is part of the validation; a kaddo guard custom rule enforces it).
15. `pnpm -F web type-check`, `pnpm -F web lint`, `pnpm -F web test` all green; the e2e happy path passes; `kaddo guard` returns 0 findings; `kaddo questions` surfaces no new blocking question this WI should have answered.
16. The DESIGN.md file is carbonized with the actual tokens used (Patch Amber hex, Operator's Ivory hex, slate scale, font families, radius scale) per ADR-007 §Implementation Path step 5.

## Tasks

Task YAML lives in `tasks/WI-007-operators-board-tasks.yml` (format mirrored on `tasks/WI-004-cdk-app-bootstrap-tasks.yml`). Ordered summary:

1. **T-01 — Reconcile existing scaffold.** Delete `apps/web/src/app/(dashboard)/components/`; consolidate components under `apps/web/src/components/`; remove blue/Spanish placeholders from the tree. Estimate: S.
2. **T-02 — Design tokens.** Decide exact hex codes for Patch Amber, Operator's Ivory, Slate Ink, Hairline Slate; pick the warm grotesk + workhorse humanist sans families; commit in `apps/web/tailwind.config.ts` and `apps/web/src/app/globals.css`. Estimate: S.
3. **T-03 — `lib/api-client.ts` + `lib/api-errors.ts`.** Typed fetch wrapper, Zod-validated responses, `X-Requested-With` on mutations, error-to-message map. Estimate: M.
4. **T-04 — `lib/auth.ts` + `middleware.ts`.** jose 5.x JWT verification, `getSession`/`getCompanyId`/`requireSession` helpers. Depends on T-03. Estimate: M.
5. **T-05 — `api/auth/callback/route.ts` + `api/auth/logout/route.ts`.** OAuth code+PKCE exchange, cookie set/clear, redirect handling. Depends on T-04. Estimate: M.
6. **T-06 — `components/jack-card.tsx` + `components/line-state-pill.tsx`.** The labeled jack row, line-state indicators. Depends on T-02. Estimate: M.
7. **T-07 — `components/usage-meter.tsx`.** Plan + credits visualization, 80%/100% thresholds. Depends on T-02. Estimate: S.
8. **T-08 — `components/stepper.tsx`.** 4-step indicator, current step in Patch Amber. Depends on T-02. Estimate: XS.
9. **T-09 — `components/wizard-store.ts` + `lib/use-hydrated.ts`.** Zustand store with persist; SSR hydration guard. Depends on T-08. Estimate: M.
10. **T-10 — `components/file-dropzone.tsx`.** Drag-and-drop, XHR upload progress, retry on transient failure. Depends on T-03, T-09. Estimate: M.
11. **T-11 — Wizard pages (steps 1–4).** Layout + four page files; same vertical space across steps; SSR redirect when a step is reached without the previous data. Depends on T-03..T-10. Estimate: M.
12. **T-12 — `app/(board)/page.tsx` (Your lines).** Server Component, fetches chatbots, renders jack cards. Depends on T-04, T-06, T-07. Estimate: S.
13. **T-13 — `app/(board)/chatbots/[id]/page.tsx` (detail).** Status, document list, meter, publish/unpublish controls, iframe generator. Depends on T-12, T-08. Estimate: M.
14. **T-14 — `app/(board)/plan/page.tsx` (plan + credits).** Plan view, credits meter, prepayment placeholder. Depends on T-07. Estimate: S.
15. **T-15 — `lib/embed.ts` (iframe generator).** `IFRAME_SNIPPET_TEMPLATE` constant, copyToClipboard helper, the security hardening. Depends on T-13. Estimate: S.
16. **T-16 — Vitest suites.** Components, store, route handlers, including the wizard-store persistence test, the iframe-snippet exact-string test, the CSRF header test. Depends on T-01..T-15. Estimate: M.
17. **T-17 — Playwright e2e happy path.** name → upload mock → review → publish → see the jack light up. Depends on T-01..T-15. Estimate: M.
18. **T-18 — Carbonize DESIGN.md.** `/impeccable document` (scan mode) at the build's finish: real tokens in, placeholder text out. Depends on T-01..T-17. Estimate: S.

## Validation

- `pnpm -F web type-check`, `pnpm -F web lint`, `pnpm -F web test` all green.
- Playwright e2e happy path green.
- `kaddo guard` returns 0 findings; the drift-into-blue-rut check is part of the guard (no `bg-blue-*`, no Spanish copy strings).
- `kaddo questions` returns no new blocking question this WI should have answered.
- Manual smoke (documented in `apps/web/README.md`): start `pnpm -F functions dev`, start `pnpm -F web dev`, sign in, create a chatbot, upload a PDF (against WI-005's stack), publish, copy the iframe snippet, paste it into a blank HTML file, ask a question, see the grounded answer.
- Recommended: 1 Judgment Day round focused on the wizard happy path + the publish security boundary (XSS in the iframe snippet, CSRF on publish, draft loss on refresh) — the three failure classes that hurt most for a customer.

## Open Questions

All decision candidates for this WI are resolved (2026-08-28). The WI is eligible to move from `draft` to `ready` once its implementation tasks begin. The exact visual tokens (hex codes and font families) are carbonized into `apps/web/DESIGN.md` by the impeccable scan step at the end of the build per ADR-007 §Implementation Path step 5.

1. **DC-007-1 — Patch Amber exact hex + font families — RESOLVED (2026-08-28, founder decision: defaults from the table below).** Exact values are committed in `apps/web/tailwind.config.ts` and `apps/web/src/app/globals.css` during T-02. The `impeccable document` scan at build finish records the actual values used. If a warm grotesk (General Sans / Söhne) is licensed later, the font swap is a single config change. | Token | Value | |---|---| | Patch Amber | `#B8860B` (dark goldenrod) | | Operator's Ivory | `#F8F4E9` (warm cream) | | Slate Ink | `#2D3142` (deep slate) | | Hairline Slate | `#D6D2C4` | | Workhorse sans | Inter (open source, system fallback) | | Mono labels | IBM Plex Mono |
2. **DC-007-2 — Override on publish with no ready documents — RESOLVED (2026-08-28, founder decision: permissive with confirmation).** The 'Continue' button is enabled; clicking it without ≥1 ready document opens a confirmation dialog explaining "the bot will not be able to answer until you upload at least one document"; confirming proceeds to publish. Strict-mode is a follow-up toggle.
3. **DC-007-3 — Prepayment flow — RESOLVED (2026-08-28, founder decision: 'Contact us' modal placeholder for MVP).** The button on the plan page opens a modal with the text "Contact us at hello@chatsaas.example to add prepaid credits." Real Stripe checkout is a separate WI.
4. **DC-007-4 — Dark mode scope — RESOLVED (2026-08-28, founder decision: NOT in this WI).** Per ADR-007's committed world (ivory/light by default, "not dark mode as default"). The Tailwind config keeps the dark-mode variant hooks present so the follow-up is a small one. No dark mode rendering in this WI.
5. **DC-007-5 — `useHydrated` strategy for nested client components — RESOLVED (2026-08-28, founder decision: per-component guard).** Each store-consuming component wraps its client-only render in a `useHydrated` check. The helper lives at `apps/web/src/lib/use-hydrated.ts` and is the canonical guard for the codebase. The alternative (global provider) is documented as a follow-up if the boilerplate becomes a maintenance burden.

## Sister WIs and dependency graph

- **WI-004 → WI-005 → WI-006** is the linear spine; **WI-008** is orthogonal.
- **WI-008 → WI-007** (this WI consumes auth).
- **WI-005 → WI-007** (this WI consumes the upload contract; document list in step 2 + the publish readiness indicator in step 3).
- **WI-006 → WI-007** (this WI consumes the chat contract for the operator's "Test your chatbot" preview — out of scope for the public visitor widget, in scope for the operator's board).
- This WI is the LAST of the round and unblocks no further WIs in this round; the next round (post-MVP) starts from here.
