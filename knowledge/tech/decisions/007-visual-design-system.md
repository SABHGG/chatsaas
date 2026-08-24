---
type: decision
status: accepted
date: 2026-08-24
related: ADR-001, ADR-003
---

# ADR-007: Visual Design System — The Operator's Board

## Context

chatSaaS requires a coherent visual design system before frontend implementation can begin. The product's brand promise is **"no cloud expertise needed"**: the non-technical customer must never see AWS terminology, infrastructure toggles, or generic SaaS-dashboard patterns. The platform operates AWS on behalf of customers, so the interface is the only thing the customer ever touches — its character directly carries the trust and "hide the cloud" promise.

The visual system is a durable product decision because:

- It defines the **brand promise** the customer experiences every session.
- It constrains every future surface (dashboard today; pricing, settings, account later) to a consistent identity.
- A generic blue SaaS dashboard would feel like every other tool; chatSaaS needs a memorable, restrained identity that survives the "non-technical, document-grounded, hosted by us" mechanism.
- The design decision is made through Impeccable's world workshop (concept-seed roll) and committed before implementation, so all UI work speaks the same language.

This ADR closes the visual design decision for **WI-001** (Define public chatbot creation and publishing). It is referenced by the dashboard surface brief and the dashboard `DESIGN.md` seed.

## Decision

Adopt **"The Operator's Board"** (Spanish: *centralita operadora*) as the committed visual world for chatSaaS. The product is rendered as a calm, warm switchboard instrument panel where the operator (the customer) plugs a customer's question into their knowledge by connecting two jacks; the line goes live. Managed infrastructure (the AWS rack the customer never touches) is implied by the metaphor, never exposed.

### World

The Operator's Board is a **warm, restrained, day-lit panel**:

- **Palette strategy: Restrained** — neutrals plus a single accent. The default for Operate mode, reinforced by the brand's "hide the cloud" promise. One accent (Patch Amber) is rationed to the live line; everything else stays achromatic.
- **Ground: warm ivory/cream** — the operator's desk surface. Light, daytime, trustworthy. Never sterile white, never dark mode as default.
- **Ink: deep slate** — primary text and the unlit jack bodies.
- **Accent: Patch Amber** — the patch-cord color. Marks ONLY the live line and the primary create/publish control. Its rarity is the point.
- **Type: warm grotesk labels + workhorse humanist sans for data** — labels feel machined and reassuring (engraved plate character); body and data stay calm and readable.
- **Geometry: jack-and-plug** — cards are gently rounded rectangles with a distinct circular "jack" indicator on one edge that reads as the connection point. The create/publish control is the "plug."
- **Elevation: flat by default** — depth is conveyed through tonal layering on the ivory ground rather than shadows. The one moment of "rise" in the system is the lit jack at publish — the only element that visually lifts.
- **Motion: purposeful and machine-like** — the patch-cord plug-in moment is the signature motion (a satisfying "click" at publish); nothing else animates for decoration.

### States (line vocabulary, not status widgets)

Every bot reads as a **line state**, not a generic status pill:

- **Unplugged** (draft) — slate jack, no cord.
- **Connecting** (processing) — animated cord, jack dimmed.
- **Live** (published) — Patch Amber lit jack, the URL + iframe snippet visible and copyable.
- **On hold** (at plan/credit limit) — dimmed/slate, with a single clear label.

### Named Rules (durable doctrine)

1. **The Live Line Rule.** Patch Amber appears only on the line that is active: the lit jack of a published bot and the primary create/publish control. If amber covers more than a small fraction of a screen, the design has drifted.
2. **The Jack Label Rule.** Labels read like engraved plate: short, machine-precise, never sentence-long. A label that needs a paragraph is body copy, not a label.
3. **The Flat-by-Default Rule.** Surfaces are flat at rest. The only elevated moment in the system is the live jack at the moment a line is plugged in.

### Do's and Don'ts (durable guardrails)

**Do:**

- Keep Patch Amber rare and purposeful — live line and primary action only.
- Keep every label and state in the operator's plain language; never expose cloud or infrastructure vocabulary.
- Read states from the line vocabulary (unplugged / connecting / live / on hold) rather than generic status widgets.
- Write all UI copy in English, per the product language commitment.

**Don't:**

- Fall back to the generic blue SaaS dashboard — the ivory/slate/amber board is the committed world.
- Introduce green or red for status; the amber line and its state label carry meaning alone.
- Let the retro switchboard theme slip into kitsch — keep it engineered, calm, and restrained.
- Use multiple accents; the system has one voice.

## Rationale

### Why this world

The Operator's Board was selected through Impeccable's `concept-seed` direction roll (seed `ddccbfbf`) over two competitive alternatives (Darkroom safelight, Monochrome proof) and the personal top-ranked pick (Recipe cookbook). The assigned direction is grounded in the audience's cultural world (small-business owners who know telephone operators from everyday life) and carries the product mechanism directly: plugging a question into knowledge is the act of creating a chatbot, and the line going live is the act of publishing.

### Why one accent

The brand promise ("no cloud expertise needed") rules out the generic SaaS-blue accent and any multi-accent "feature-rich dashboard" pattern. A single warm accent rationed to the live path produces a coherent identity, signals that the only thing worth highlighting is the moment a customer-facing bot is live, and prevents the interface from competing with itself. Status is carried by the accent's *presence* (amber = live) plus line-state labels — no green/red required.

### Why English copy

`PRODUCT.md` records the product language commitment: UI copy in English for MVP (founder converses in Spanish; generated artifacts default to English). Impeccable's brand commitment propagates from PRODUCT.md.

### Why ivory/light, not dark

Light, warm ground matches the operator's desk scene (small business, daytime office use, "managed for you" reassurance). Dark mode is not the default and is not the committed direction.

### Why the world is committed before implementation

Impeccable's `new-work` flow commits the world before code so that all UI work speaks the same language from line one. A visual decision made mid-build drifts toward the category default (the blue SaaS rut); a committed world resists that drift.

## Consequences

**Positive:**

- A coherent, memorable identity that survives across future surfaces (pricing, settings, account, public chat page) without re-deciding.
- The interface visibly carries the brand promise — no AWS vocabulary, no generic blue dashboard.
- Status states are unambiguous: line vocabulary reads instantly.
- A clear boundary between the **brand layer** (the world) and the **component layer** (specific tokens / components) — components are carbonized into `DESIGN.md` only after implementation, per Impeccable's seed-then-scan discipline.

**Negative / risks:**

- The retro switchboard theme can slip into kitsch if not executed with restraint. The risk is mitigated by the Flat-by-Default Rule, the Live Line Rule, and the ivory/light ground (which reads as "engineered machine room", not "vintage shop").
- Warm grotesk / ivory/cream typographic palette can drift into the AI-default "warm editorial" pattern if not paired with strict Patch Amber rationing. The Live Line Rule enforces the discipline.
- Existing scaffold (`apps/web/src/`) was built in the generic blue world (wizard with blue-600 / gray cards, Spanish copy). It must be reconstructed in the Operator's Board before WI-001 implementation; the previous scaffold is treated as evidence of the category rut, not authority.
- Duplicate component folders (`apps/web/src/components/` and `apps/web/src/app/(dashboard)/components/`) must be deduplicated during the rebuild.

**Trade-offs accepted:**

- The world is committed before exact token values (hex codes, font families) are resolved. Per Impeccable, exact tokens are decided during implementation and recorded by `/impeccable document` (scan mode) at the build's finish — not before.
- Component specifications (bot card, create/plug control, stepper, usage meter) are referenced but not detailed here; they live in the implementation tasks.

## Implementation Path

1. **Reconcile existing artifacts.** `apps/web/DESIGN.md` was rewritten as a canonical Impeccable seed for this world (English, 8-section structure, committed invariants, honest placeholders for exact tokens). The previous direction-contract seed (blue wizard, Spanish) is superseded.
2. **Rebuild the dashboard scaffold** in the Operator's Board world (ivory ground, slate ink, Patch Amber reserved for live line / primary action, jack-and-plug geometry, English copy, line-vocabulary states).
3. **Deduplicate components.** Resolve the two component folders during the rebuild.
4. **Decide exact tokens during implementation** (Patch Amber hex, Operator's Ivory hex, slate scale, warm grotesk + workhorse sans families, radius scale, spacing scale).
5. **Run `/impeccable document` (scan mode) at the build's finish** to carbonize real tokens into `DESIGN.md` and generate the `.impeccable/design.json` sidecar from the built world.
6. **Apply the work-unit discipline** (see `work-unit-commits`) so the rebuild is committed as reviewable units, not one giant change.

## Links

- **Related ADRs:** [ADR-001](./001-use-cognito-for-authentication.md) (auth), [ADR-003](./003-technology-stack-selection.md) (stack — the tools over which this world is built).
- **Product truth:** [PRODUCT.md](../../../../PRODUCT.md) at repo root.
- **Visual seed:** [apps/web/DESIGN.md](../../../web/DESIGN.md) — canonical Impeccable seed for this world.
- **Impeccable concept-seed key:** `ddccbfbf` (mode: operate).
- **Work Item:** WI-001 *Define public chatbot creation and publishing* (Ready state in `knowledge/delivery/work-items/ready/`).
