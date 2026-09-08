---
type: feature
id: WI-010
title: "Board polish + Spanish marketing landing at / (guest funnel)"
knowledge_level: K2
status: ready
phase: now
initiative: "RM-001"
domains:
  - "Public Chatbot Delivery"
created_at: "2026-09-06"
source: founder-direct-request
source_id: board-polish-landing-2026-09-06
source_title: "Complete and polish the Operator's Board; Spanish landing page at /"
source_context: "Founder request in the feature/board-polish-landing worktree: finish the board surfaces per DESIGN.md (loading states, empty states, accessibility, responsive), verify the component dedupe, and add the Spanish marketing landing at / with the root route serving guests the landing and sending authenticated users to /board."
source_initiative: "Public Document-Grounded Chatbot"
expected_value: "Guests landing on / read a Spanish marketing page (hero, how-it-works, benefits, FAQ/social-proof placeholder, CTA to /login) built in the committed Flight-Strip world; signed-in operators are redirected server-side to /board; the board gains honest loading states and final accessibility polish; all existing tests stay green."
risks:
  - "**R-1 (MEDIUM) Spanish copy vs the world-contract guard.** `world-contract.test.ts` bans Spanish UI copy across the whole `src/` tree (PRODUCT.md English commitment). The landing is an EXPLICIT user decision that overrides PRODUCT.md for the landing route ONLY. The guard must learn a narrow exclusion for the landing route group — the board, the wizard, the plan surface, and the visitor chat stay English-only."
  - "**R-2 (LOW) Root-route regression for operators.** `/` currently redirects everyone to /board (then middleware bounces guests to /login). Moving the landing into `/` must preserve: authenticated users land on /board server-side; guests never see a broken state if the session read fails (fail toward the landing, never a 500)."
  - "**R-3 (LOW) Pricing invention.** PRODUCT.md: pricing is explicitly undecided — the landing must use qualitative copy only (clear limits, no numbers) and must not fabricate logos, testimonials, or metrics (no invented social proof)."
  - "**R-4 (LOW) Board polish must not rebuild.** WI-007 landed the Flight-Strip world complete; this WI polishes (loading skeletons, a11y gaps) and does not rebuild working features or re-token the world."
dependencies:
  - "WI-007 (completed) — the Flight-Strip Control Board world: DESIGN.md tokens, component grammar, board surfaces. The dedupe of the two component folders was completed in that rebuild; this WI verifies it and does not re-open it."
  - "WI-009 (draft/completed code) — the visitor chat is its own quiet world; the landing must NOT borrow its white-ground tokens either. The landing rides the operator's material world (rack ground, paper, ink, stamp red rationed)."
  - "PRODUCT.md — pricing undecided (qualitative copy only); no fabricated evidence; AWS vocabulary stays out of customer UI (the hero's 'sin tocar AWS' phrasing is the recorded founder exception for the landing)."
  - "DESIGN.md (apps/web) — canonical visual seed; the landing is its first marketing surface and its copy-language exception."
code:
  - "apps/web/src/app/page.tsx (replace plain redirect: guest → landing, session → /board)"
  - "apps/web/src/app/(landing)/page.tsx (new — Spanish landing; route group keeps the guard exclusion surgical)"
  - "apps/web/src/app/(landing)/page.test.tsx (new — guest/auth redirect logic + landing content)"
  - "apps/web/src/world-contract.test.ts (narrow landing exclusion + comment citing the recorded decision)"
  - "apps/web/src/app/board/loading.tsx (new — rack skeleton while the server component fetches)"
  - "apps/web/src/app/board/plan/loading.tsx (new — plan surface skeleton)"
  - "apps/web/DESIGN.md (document the landing surface + root-redirect behavior + copy-language exception)"
  - "knowledge/delivery/work-items/ready/WI-010-board-polish-spanish-landing.md (this file, moved to completed at finish)"
  - "tasks/WI-010-board-polish-landing-tasks.yml"
---

# WI-010: Board polish + Spanish marketing landing at /

## Goal

Complete the frontend hand-off: the board surfaces end polished (loading, empty,
a11y, responsive — no rebuild), the root route becomes the Spanish guest funnel
to /login, and the world contract guard learns the one recorded copy-language
exception without loosening anything else.

## Recorded decision (explicit user decision, overrides PRODUCT.md for the landing only)

The landing page copy is **Spanish**. PRODUCT.md binds product UI copy to
English for the MVP; this founder decision overrides it for the marketing
landing route only. Everything else — board, wizard, plan, login, visitor chat —
stays English-only, and `world-contract.test.ts` keeps enforcing that (with a
surgical exclusion for the landing route group). The hero value prop is
"chatbot de IA entrenado con los documentos de tu empresa, sin tocar AWS": the
AWS mention is the founder-approved marketing framing of the hide-the-cloud
promise on this one marketing surface; product surfaces still never expose
cloud vocabulary.

## Scope

**In scope:**

- Root route `/`: guest → Spanish landing; authenticated → server-side redirect
  to /board using the existing session lib (`getSession`).
- Spanish landing: hero (value prop), how-it-works (3 steps: crear chatbot,
  subir documentos, compartir URL o iframe), benefits, FAQ / social-proof
  placeholder (honest, no fabricated logos or quotes), CTA to /login, footer.
  Qualitative pricing copy only ("planes con límites claros", no numbers).
- Visual system: the committed Flight-Strip world (rack-metal ground, paper
  cards, ink, stamp red rationed to the primary CTA, mono instrument labels,
  squared corners, hairlines, no gradients).
- Board polish: loading states (`loading.tsx` skeletons in the world's
  grammar), accessibility gaps (skip link, landmark audit), responsive
  verification. No rebuilds.
- Component dedupe: verified state (single `src/components/` folder, `@/`
  alias imports, no duplicate button components — completed in WI-007's
  rebuild; documented in the report).
- Tests: landing guest/auth behavior; all existing suites stay green.

**Out of scope (explicitly):**

- English or bilingual landing variants; i18n infrastructure.
- Pricing figures, plan comparison tables, checkout.
- Real testimonials, logos, or metrics (nothing exists — PRODUCT.md Evidence).
- Dark mode, new saturated colors, gradients.
- Visitor chat changes; backend changes; infra changes.

## Acceptance Criteria

1. `/` renders the Spanish landing for guests; an authenticated session is
   redirected to `/board` server-side before anything renders (vitest-proven
   for both paths).
2. The landing carries the required sections in Spanish: hero with the recorded
   value prop, 3-step how-it-works, benefits, FAQ or social-proof placeholder,
   CTA to /login, footer; qualitative pricing language only — no numbers, no
   invented social proof.
3. The landing visual language is the Flight-Strip world: `--background`
   ground, `--card` paper, ink, stamp red rationed to at most one resting
   element (the primary CTA), mono instrument labels, squared corners,
   hairlines, no gradients, no blue utilities, reduced-motion safe.
4. `/board` and `/board/plan` render in-world loading skeletons while their
   server components stream, instead of a bare ground flash.
5. Board accessibility: skip-to-content link, heading/landmark audit clean;
   existing empty/429/error states untouched.
6. The component dedupe is verified and reported (single components folder,
   one Button implementation, consistent imports).
7. `world-contract.test.ts` keeps banning Spanish copy everywhere except the
   landing route group; retired tokens, legacy hexes, and blue utilities stay
   banned tree-wide.
8. Gates green: `pnpm -F @chatsaas/web test`, `type-check`, `lint`, `build`.

## Tasks

1. **T-01 — Kaddo gate.** This WI + tasks YAML; the Spanish decision recorded.
   Done.
2. **T-02 — Dedupe verification.** Confirm single components folder, no
   duplicate buttons, consistent `@/` imports; report. Estimate: S.
3. **T-03 — Board loading states.** `app/board/loading.tsx` +
   `app/board/plan/loading.tsx`: squared skeleton strips/cards from the staged
   Skeleton primitive's grammar, no new tokens. Estimate: S.
4. **T-04 — Board a11y polish.** Skip-to-content in the board layout; landmark
   and heading audit across board surfaces. Estimate: S.
5. **T-05 — Landing route.** `(landing)/page.tsx` in Spanish with all required
   sections; root `page.tsx` becomes the session gate (guest → landing,
   authed → /board). Estimate: M.
6. **T-06 — World-contract guard.** Narrow exclusion for `(landing)` with the
   decision cited; every other rule untouched. Depends on T-05. Estimate: S.
7. **T-07 — Landing tests.** Guest renders the landing (Spanish sections + CTA
   href), authed redirects to /board. Depends on T-05. Estimate: S.
8. **T-08 — DESIGN.md + finish.** Document the landing surface, root redirect,
   and the copy-language exception; run all gates; move the WI to completed.
   Depends on T-01..T-07. Estimate: S.

## Validation

- `pnpm -F @chatsaas/web test` green (existing 138 + landing/guard suites).
- `pnpm -F @chatsaas/web type-check` clean; `lint` clean; `build` succeeds.
- Manual check: `pnpm -F @chatsaas/web dev` → `/` as guest shows the landing;
  with a valid session cookie, `/` redirects to /board.
- `kaddo guard` suggested at finish (per AGENTS.md; not mandatory).

## Open Questions

None blocking. The Spanish landing and the qualitative-pricing constraint are
explicit founder decisions recorded above; pricing tiers remain deferred
(PRODUCT.md "Explicitly undecided"), which the landing copy respects.
