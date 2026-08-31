---
name: chatSaaS
description: Managed document-grounded AI chatbots — the operator's board.
colors:
  patch-amber: "#b8860b"
  patch-amber-deep: "#8a6508"
  operators-ivory: "#f8f4e9"
  panel-warm: "#fdfbf4"
  well-warm: "#ede7d3"
  slate-ink: "#2d3142"
  hairline-slate: "#d6d2c4"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "2.25rem"
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.08em"
    textTransform: "uppercase"
rounded:
  jack: "9999px"
  plug: "9999px"
  card: "14px"
  plate: "6px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  section: "40px"
components:
  plug-primary:
    backgroundColor: "{colors.patch-amber-deep}"
    textColor: "{colors.operators-ivory}"
    typography: "{typography.label}"
    rounded: "{rounded.plug}"
    padding: "10px 20px"
  plug-primary-hover:
    backgroundColor: "#8a6508e6"
  plug-ink:
    backgroundColor: "{colors.slate-ink}"
    textColor: "{colors.operators-ivory}"
    typography: "{typography.label}"
    rounded: "{rounded.plug}"
    padding: "10px 20px"
  plug-ink-hover:
    backgroundColor: "#2d3142e6"
  button-ghost:
    backgroundColor: "{colors.panel-warm}"
    textColor: "{colors.slate-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.plate}"
    padding: "8px 16px"
  card-jack:
    backgroundColor: "{colors.panel-warm}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.card}"
    padding: "20px"
  dialog-panel:
    backgroundColor: "{colors.panel-warm}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  pill-state:
    backgroundColor: "transparent"
    textColor: "{colors.slate-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.plate}"
    padding: "4px 10px"
  input-text:
    backgroundColor: "{colors.panel-warm}"
    textColor: "{colors.slate-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: "12px 16px"
---

# Design System: chatSaaS — The Operator's Board

## Overview

**Creative North Star: "The Operator's Board"**

chatSaaS is a switchboard. The operator — a non-technical small-business owner — plugs a customer's question into their knowledge by connecting two jacks, and the line goes live. The managed infrastructure (the rack, the routing, the machines) is real but invisible; the operator only ever sees labeled jacks, a patch cord, and a lit line. The interface is a calm instrument panel: warm ivory ground, deep slate ink, and a single warm accent that appears only where a line is actually live. Every state reads instantly from the panel's own vocabulary — unplugged, connecting, live, on hold — never from jargon.

This is a workhorse surface, not a spectacle. The visitor came to operate: create a chatbot from their documents, publish it to their site, and know exactly where they stand against their plan and credits. Density is generous and unhurried; nothing glitters except the moment a line goes live. The register is trustworthy, warm, and engineered to feel like a well-kept machine room rather than a startup dashboard. The build landed as committed, with two recorded adaptations: depth is carried by a two-step tonal layering (Panel Warm cards on the ivory ground, Well Warm for inset wells — Panel Warm `#FDFBF4`, Well Warm `#EDE7D3`), and amber gained a second, darker step (Patch Amber Deep `#8A6508`) because raw amber on ivory fails the 4.5:1 contrast floor for text and filled controls. Raw Patch Amber stays surface-only; Deep is the amber that speaks.

**Key Characteristics:**
- One warm accent (amber) reserved for the live line; everything else stays achromatic.
- Ivory/cream ground with deep slate ink — light, not dark, built for daytime office use (light scheme is pinned; no dark mode).
- Inter for body and data; IBM Plex Mono labels with engraved-plate letter spacing (`0.08em`).
- Two-step tonal layering instead of shadows: Panel Warm cards on the ivory ground, Well Warm wells; exactly one shadow in the system.
- Generous rhythm and quiet density; the interface recedes until a line is live.
- Every bot is a labeled jack on a board; states are line states, never status widgets.

## Colors

The palette is restrained by design: a warm neutral field with a single accent that is rationed to the active path. No secondary or tertiary accents — the system deliberately has one voice. Status is carried by the accent's *presence* (amber = live) and by line-state labels, never by introducing green/red.

### Primary
- **Patch Amber** (`#B8860B`): the patch-cord color, surface-only. Marks the live jack body, the live pill's dot and border, the stepper's current waypoint, and the live ring (the amber glow shadow on a lit jack). It is never text on ivory — raw amber is ~3:1 there. It is the rare color; its rarity is the point.
- **Patch Amber Deep** (`#8A6508`): the text-safe amber, added during the finish review as the contrast fix. Raw amber fails the 4.5:1 floor on ivory, so every amber *label* and every filled primary control ground uses this darker step (live pill label, current-step label, the Plug control ground). It exists solely so amber can speak where ink would otherwise have to.

### Neutral
- **Operator's Ivory** (`#F8F4E9`): the panel ground — the page background, the text on filled ink/amber controls, the pinhole inside every jack, and the selection foreground.
- **Panel Warm** (`#FDFBF4`): the card surface — one bright step up from the ivory ground. Every card, dialog panel, input, and snippet box sits here.
- **Well Warm** (`#EDE7D3`): the inset well — one step down from the ground. Meter and progress channels, the dropzone's drag-over ground, hover grounds for ghost buttons, and selected plan options.
- **Slate Ink** (`#2D3142`): primary text, the unlit jack bodies, ink meter fills, the ink plug control, the selection background, the focus outline, and the dialog overlay (`40%` alpha).
- **Hairline Slate** (`#D6D2C4`): borders and dividers — card outlines, the header rule, pill borders, the dropzone's dashed border, unwired stepper cords, and thin scrollbars.

### Named Rules
**The Live Line Rule.** Patch Amber appears only on the line that is active: the lit jack of a published bot, the primary create/publish control, the create flow's current waypoint (the plug path — sanctioned by the WI-007 visual contract, Task 8), and the live pill. Raw amber is surface-only; amber as text is always Patch Amber Deep. If amber covers more than a small fraction of a screen, the design has drifted.

## Typography

**Display Font:** Inter (via `next/font`; fallback `ui-sans-serif, system-ui, sans-serif`)
**Body Font:** Inter (same stack)
**Label/Mono Font:** IBM Plex Mono, weights 400/500/600 (via `next/font`; fallback `ui-monospace, "SFMono-Regular", monospace`)

**Character:** A workhorse humanist sans for body and data that stays legible at small sizes, paired with a machined mono label voice — every label, plate, URL, and readout is letter-spaced uppercase IBM Plex Mono, the engraved plate of a machine room. Two voices only; there is no serif and no display face.

### Hierarchy
- **Display** (Inter 600, 30px/36px, tracking `-0.025em`): page titles — "Your lines", "Plan & credits" (`text-3xl font-semibold tracking-tight`).
- **Headline** (Inter 600, 24px/32px, tracking `-0.025em`): the four wizard step titles — "Name the line", "Wire in documents", "Review the line", "Plug the line in" (`text-2xl font-semibold tracking-tight`).
- **Title** (Inter 600, 20px/28px, tracking `-0.025em`): section subheads like the empty-board "No lines on the board yet" (`text-xl font-semibold tracking-tight`); card names inside dialogs drop to 16px/24px semibold (`text-base font-semibold`).
- **Body** (Inter 400, 14px, relaxed 1.625 leading): helper text and descriptions, usually at 70–80% ink (`text-sm leading-relaxed text-slate-ink/70`); the plugged-in readout is 16px.
- **Label** (IBM Plex Mono 500, 12px, letter-spacing `0.08em`, uppercase): jack names, field labels, pill and stepper labels, meter readouts (`tabular-nums` for numbers), nav links, format hints, and every button label. The product wordmark is the same voice one step up (14px, 600).

### Named Rules
**The Jack Label Rule.** Labels read like engraved plate: short, machine-precise, never sentence-long. A label that needs a paragraph is body copy, not a label.

## Layout

Desktop-first, single column, no grid scaffolding. Everything lives on one centered **64rem (`max-w-5xl`) column** with 24px side gutters. The board shell is a header row (product wordmark, nav, credits) on the ivory ground over a 1px hairline bottom border, with 16px vertical padding; `main` carries 40px vertical padding. The board itself is a stacked list of jack rows separated by 16px gaps. The guided create flow moves through four discrete steps (name → documents → review → publish), each occupying **the same fixed panel: `min-height: 26rem` (416px)** with footer controls pinned at its end, so nothing shifts between steps. Responsive behavior is narrow and deliberate: below `sm` (640px) header gaps tighten so the compact credits pill fits; below `md` (768px) the meter card hides and the credits position rides the header as a compact ink pill, so the operator's state stays in the first viewport. Spacing rhythm is Tailwind's 4px base at recurring steps: 8px (tight gaps), 16px (card/component rhythm), 20px (card padding), 24px (dialog padding, gutters), 40px (section padding).

## Elevation & Depth

Depth is tonal, not cast. The system is **flat at rest** and layers the warm neutrals in two steps: Panel Warm (`#FDFBF4`) cards sit one bright step above the Operator's Ivory ground, and Well Warm (`#EDE7D3`) sits one warm step below it as the inset well for channels, drag-over states, hovers, and selections. The dialog separates with a 40% ink overlay and a hairline border — its panel carries no shadow of its own. There is exactly **one shadow in the system**, and it is the one moment of "rise": the lit jack at publish. Even the motion's shadow bloom lands on this same resting value.

### Shadow Vocabulary
- **Live jack** (`box-shadow: 0 2px 12px 0 rgb(184 134 11 / 0.35)`, token `--shadow-live-jack`): the amber ring around a lit jack — the live bot card's jack and the embed panel's live jack. A 2px offset plus 12px blur, per the craft floor — never a flat halo. No other element may cast it.

### Named Rules
**The Flat-by-Default Rule.** Surfaces are flat at rest. The only elevated moment in the system is the live jack at the moment a line is plugged in.

## Shapes

Jack-and-plug geometry. Cards and panels are gently rounded rects (**14px**, token `radius-card`); controls that *act* — the plug, dialog buttons, the copy control — are perfect pills (**9999px**, tokens `radius-jack`/`radius-plug`); small plates — pills, chips, option rows, ghost buttons — take a tight **6px** (`radius-plate`). Every surface is outlined with a 1px hairline in Hairline Slate; the dropzone is the one dashed outline. The recurring silhouette is the circular jack: a 44px circle with a 12px ivory pinhole on the card, a 24px circle with a 6px pinhole on the embed panel, a 6px dot in the state pill, and 16px bordered waypoints on the stepper. Focus is **ink, never blue**: a 2px solid Slate Ink outline with 2px offset (radius falls back to the 6px plate step). Browser surfaces stay in-world: text selection is ink-on-ivory, scrollbars are thin hairline, and `color-scheme` is pinned to light.

## Components

### Buttons (the plug)
- **Shape:** pill — the plug geometry (9999px); ghost actions take the 6px plate radius.
- **Primary (the Plug):** Patch Amber Deep ground (`#8A6508`), Operator's Ivory text, mono label 12px semibold uppercase `0.08em`, padding 10px 20px (wizard's final step: 24px inline). Used only where a line is actually being plugged in: "Plug in a new line" on the board, the detail and wizard publish controls, dialog primary actions. Hover deepens to 90% opacity ground; disabled sits at 60% opacity.
- **Ink plug:** Slate Ink ground, ivory text, same voice — the workhorse control (step continues, "Copy snippet", "Unplug", login). Hover: 90% opacity.
- **Ghost / plate:** Panel Warm ground, hairline border, ink text, 8px × 16px padding — cancel, dismiss, "Go to plan", "Try again". Hover: Well Warm ground.
- **Focus:** the global ink outline (2px solid, 2px offset). All labels are mono uppercase — buttons never speak in sentence case.

### Line-state pill
- **Style:** transparent ground, hairline border, 6px plate radius, 4px × 10px padding, mono 12px uppercase `0.08em`, with a 6px state dot.
- **State (the four-state line vocabulary, never status widgets):** **Live** — Patch Amber border, Patch Amber Deep label, raw amber dot (the only amber). **Connecting** — achromatic, pulsing 70% ink dot. **Unplugged / On hold** — achromatic, 40% ink dot. No green, no red: the accent's presence *is* the live signal.

### Jack card
- **Corner Style:** 14px card radius. **Background:** Panel Warm over a 1px hairline border. **Shadow Strategy:** flat — see Elevation; the shadow lives on the jack, never the card. **Internal Padding:** 20px, 16px internal gaps.
- **Anatomy:** the 44px circular jack on the leading edge (body per state: unplugged = Slate Ink, connecting = pulsing 50% ink, live = **Patch Amber + live-jack shadow**, on hold = 40% ink; the 12px ivory pinhole never changes color), the bot name as an engraved-plate mono label (14px medium uppercase, truncated), the line-state pill on the trailing edge, and an `sr-only` line reading name + state for screen readers.
- **The just-plugged moment:** the card may play the patch-cord click (`--animate-jack-click`) exactly once — only on the card the operator just published, never on plain board renders.

### Usage meter
- **Style:** Panel Warm card, hairline border, 20px padding; mono "Credits" plate header; status surfaces appear as a bordered plate pill (hairline ink/30 border) to the header's right.
- **The gauge channel:** an 8px-tall full-radius Well Warm well with a Slate Ink fill and a 1px ink/30 tick at the 80% mark — a gauge channel, not a SaaS progress bar. The fill stays ink at every level: this is instrumentation, not the live line.
- **State:** used ≥ 80% → "Almost out of credits"; plan exhausted, zero prepaid balance, or a 429 from the API → "On hold" (the line vocabulary, exactly). Readouts are mono 12px `tabular-nums`; follow-up copy speaks in operator language ("Top up your plan to bring it back.").

### Stepper (the cord)
- **Style:** four waypoints — name, documents, review, publish — joined by a 1px cord (`flex-1`). Waypoints are 16px circles with 2px borders: complete = ink-filled, **current = Patch Amber-filled** (the plug path; label in Patch Amber Deep), future = transparent with hairline border. The cord is ink once wired, hairline ahead. Labels: mono 12px uppercase.

### Dialog
- **Style:** a full-screen 40% Slate Ink overlay over an in-world panel — never `window.confirm`, never a browser alert. Panel: `max-width: 28rem`, 14px radius, Panel Warm, hairline border, 24px padding, **no shadow** — separation comes from the overlay and the border (Flat-by-Default holds here too).
- **Anatomy:** mono 14px semibold uppercase title; 14px relaxed body at 80% ink; actions right-aligned with 12px gaps using the shared button classes (ghost "Not now", primary Plug or ink plug). Escape closes; focus lands on the panel.

### File dropzone
- **Style:** 14px radius, **dashed** hairline border, Panel Warm ground, centered, 24px × 40px padding; a visually-hidden file input keeps native keyboard focus and Enter/Space activation.
- **State:** drag-over flips to an ink border on the Well Warm ground; uploading shows a mono "Uploading · N%" readout over an 8px Well Warm channel with an ink fill (wiring work — never amber); errors surface as operator-language alert text with a ghost "Try again" plate. Format hint: mono 12px at 60% ink ("PDF · DOCX · TXT · MD · up to 10 MB").

### Embed snippet
- **Style:** the panel's live-line jack — a 24px Patch Amber circle with the live-jack shadow — beside a mono "Embed on your site" plate header; a read-only mono 12px snippet box (14px radius, hairline border, Panel Warm, 16px padding) that selects on focus.
- **Behavior:** "Copy snippet" is an ink plug; copying is this panel's patch-cord moment — on a *successful* copy only, the little jack plays the click, a mono "Copied." readout appears (`aria-live`), and both settle after ~1.6s. Never animates for decoration.

### Compact credits pill (mobile)
- **Style:** below `md`, the meter card yields to a compact ink pill in the header — Slate Ink ground, ivory mono 12px uppercase label, 6px plate radius, 4px × 10px padding, flat (no shadow). It mirrors the meter's status ladder exactly (`Credits: N`, `· Almost out of credits`, or `On hold`), so the two surfaces can never disagree.

## Do's and Don'ts

### Do:
- **Do** keep Patch Amber rare and purposeful — the live jack, the plug control, the current waypoint, and the live pill only; raw amber surface-only, `#8A6508` wherever amber must be text or a filled control.
- **Do** keep every label and state in the operator's plain language; never expose cloud or infrastructure vocabulary.
- **Do** read states from the line vocabulary (unplugged / connecting / live / on hold) rather than generic status widgets.
- **Do** carry depth with the two-step tonal layering — Panel Warm `#FDFBF4` for surfaces, Well Warm `#EDE7D3` for wells, hovers, and selections.
- **Do** keep browser surfaces in-world: ink selection, thin hairline scrollbars, light scheme pinned.
- **Do** write all UI copy in English, per the product language commitment.

### Don't:
- **Don't** fall back to the generic blue SaaS dashboard — the ivory/slate/amber board is the committed world (the focus outline is ink, never the blue default).
- **Don't** introduce green or red for status; the amber line and its state label carry meaning alone.
- **Don't** add a second shadow or animate the board for decoration — the only shadow is the live jack's, and the only authored motion is the patch-cord click at publish/copy moments.
- **Don't** set raw Patch Amber as text on ivory; it fails 4.5:1 — Patch Amber Deep exists for that.
- **Don't** let the retro switchboard theme slip into kitsch — keep it engineered, calm, and restrained.
- **Don't** use multiple accents; the system has one voice. And don't reach for `window.confirm`/`alert` — the in-world Dialog is the only confirmation surface.
