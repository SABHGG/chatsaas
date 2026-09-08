---
name: chatSaaS
description: Managed document-grounded AI chatbots — the Flight-Strip Control Board.
tokens:
  source: "src/app/globals.css (shadcn variable set + flight-strip grammar layer, Tailwind v4 CSS-first)"
  baseColor: neutral
  cssVariables: true
  ground: "#e8eaec (--background — cool rack-metal gray; the ground is not white)"
  paper: "#fbfaf7 (--card — warm paper strips)"
  ink: "#16181a (--foreground, --primary, --ring — near-black ink)"
  stamp: "#c8331f (--stamp = --destructive — inscription red, the ONLY saturated color)"
  radius: "0.125rem (--radius — squared, strip-like)"
  darkMode: "variables declared, never activated (no dark toggle — explicit follow-up)"
fonts:
  sans: "Inter (next/font) → --font-sans (prose)"
  mono: "IBM Plex Mono (next/font, 400/500/600) → --font-mono (LOAD-BEARING: every quantity, readout, stamp, and instrument label)"
---

# Design System: chatSaaS — the Flight-Strip Control Board

## Overview

**Creative North Star: "The Flight-Strip Control Board"** — an ATC strip
rack for chatbot lines. Every chatbot line is a paper strip clipped into
a rack-metal board; pulling a strip opens its workspace beside the rack.
The operator scans every line's state at a glance, works one line at a
time, files new lines through a 4-step flight-plan wizard, and reads
plan charges as tower entries.

The material world is three neutrals and one red: a cool rack-metal gray
ground (`#e8eaec` via `--background`), warm paper strips (`#fbfaf7` via
`--card`), near-black ink (`#16181a`), and inscription red (`#c8331f`,
`--stamp`) reserved for the live stamp, the NEW LINE lever, and the
destructive family. Nothing else is saturated. The foundation is still
shadcn/ui on Tailwind v4 (CSS-first, tokens in `:root`, utilities via
`@theme inline`); the flight-strip grammar layer sits at the foot of
`globals.css` as shared component classes.

IBM Plex Mono is load-bearing, not decorative: every quantity, readout,
stamp, legend, and instrument label speaks in the typewriter voice.
Inter carries prose. Corners are squared (`--radius: 0.125rem`).

**Key Characteristics:**
- State is carried by FORM — stamp, dash, doubling, HOLD bar — never by hue alone.
- One saturated color (`--stamp #c8331f`), used at stamp scale, never as a field.
- Mono for instruments, sans for prose; squared corners everywhere.
- Depth is two soft lift shadows; no bevels, no faked physicality.
- Exactly one moving light per surface (the connecting chase); one authored moment (the publish stamp press).

## Colors

A cool-gray ground carrying warm paper, read through near-black ink, with
one inscription red. The chart ramp is achromatic on purpose
(`#c9cbc8 → #16181a`) — instrumentation never gets hue.

### Primary
- **Inscription Red — the stamp** (`#c8331f`, `--stamp`): the ONLY
  saturated color. The live LIVE stamp, the embed label stamp, the NEW
  LINE lever (`Button` `stamp` variant), and the destructive family
  (`--destructive` is the same value; destructive buttons/badges ride
  its 10–20% tints). Held lines read "on hold" through this family.

### Neutral
- **Rack-metal ground** (`#e8eaec`, `--background`): page ground. The
  ground is NOT white — white would break the material read.
- **Paper strip** (`#fbfaf7`, `--card`, `--popover`): every strip, panel,
  dialog, and tray. Warm against the cool ground.
- **Ink** (`#16181a`, `--foreground`/`--primary`/`--ring`): text, solid
  controls, meter fills, focus rings, the HOLD bar, selection highlight
  (`::selection` is ink with ground-colored text — inverted, not tinted).
- **Paper-dim** (`#edece7`, `--secondary`; `#e4e4e0`, `--muted`;
  `#f2f0ea`, `--accent`): quiet grounds, tracks, hover/selection washes.
- **Quiet ink** (`#565a57`, `--muted-foreground`): secondary text.
- **Hairline** (`#c9cbc8`, `--border`, `--input`): 1px edges everywhere.

### Named Rules
**The One Stamp Rule.** `#c8331f` appears only at stamp/lever scale — a
name-block, a badge, one button. Never as a background field, never on
two live elements of the same kind on one surface: a surface shows at
most one red LIVE stamp (strip or header, not both) and the rack shows
red only for lines that are actually live.

**The Ground Is Not White Rule.** Surfaces layer paper (`#fbfaf7`) on
rack-metal (`#e8eaec`); anything still white is a migration bug.

## Typography

**Body Font:** Inter (`--font-sans`) — the prose voice: explanations,
descriptions, empty states, dialog copy.
**Instrument Font:** IBM Plex Mono (`--font-mono`) — LOAD-BEARING: every
quantity, readout, stamp, legend entry, and section mark.

**Character:** a typewriter strapped to a control tower. Inter keeps the
operator's language humane; Plex Mono makes every instrument figure feel
typed onto the strip.

### Hierarchy
- **Page title** (Inter, semibold, `text-3xl`/`text-2xl`, tight tracking): "Your lines", "Plan & credits", wizard step titles.
- **Body** (Inter, 400, `text-sm`, relaxed leading): prose, helper copy (max-w constrained, ~md).
- **Instrument label** (`.label-mono`: Plex Mono, 0.6875rem/1rem, letter-spacing 0.14em, uppercase): rack headers ("Lines"), section marks ("Plans", "Credits"), stamps, legend, lever copy.
- **Readout** (`.readout-mono`: Plex Mono, `tabular-nums`, 0.6875rem–`text-sm`): every quantity — docs counts, fleet figures, credit balances, prices, upload %, the embed snippet.

### Named Rules
**The Typed Figure Rule.** If it is a quantity or a machine fact, it is
mono (`.readout-mono`); if it is a section mark or stamp, it is
`.label-mono`. Inter never renders a number that reads as instrumentation.

## Layout

- **Board** (`/board`): a two-column rack composition on lg+ —
  `lg:grid-cols-[16rem_1fr]`, gap-10, inside `max-w-5xl`. The rack is
  the left column; the selected strip's workspace fills the rest.
  Below lg the rack collapses to a horizontal strip (the list scrolls
  sideways) and the plan link + credits pill ride the header.
- **Rack interior**: `label-mono` "Lines" header with a `readout-mono`
  count; strips in a `flex-col gap-2` list on `bg-foreground/[0.03]`
  with `border-x`; at the rack's foot the credits meter, the plan link,
  and the sticky state legend (`sticky bottom-0` — it never moves).
- **Wizard**: the stepper on top, then ONE fixed vertical panel
  (`min-h-[26rem]`) — all four steps occupy the same space, nothing
  shifts between steps.
- **Header** (all board surfaces): compact bar — `chatSaaS` wordmark, a
  vertical separator, `label-mono` "Operator's Board"; below lg the
  Plan link and compact credits pill join it.
- **Rhythm**: shell padding `px-6 py-10`; section stacks run `mt-8`/`mt-10` with `pt-6` rule lines above footers. The NEW LINE lever sits at the pane's foot, bottom-left.

## Elevation & Depth

Flat by default; depth is earned by two named soft shadows and nothing
else. There are no drop-shadow utilities, no layered card stacks.

- **`shadow-strip-pull`** (`0 10px 22px rgb(22 24 26 / 0.18), 0 2px 6px rgb(22 24 26 / 0.12)`): the selected strip pulled from the rack — paired with `lg:translate-x-2`, never rotation.
- **`shadow-paper-lift`** (`0 14px 32px rgb(22 24 26 / 0.16), 0 3px 8px rgb(22 24 26 / 0.08)`): paper lifted off the desk — dialog panels.

### Named Rules
**The Soft Lift Rule.** The only shadows in the system are the two named
lifts above. Hard offset shadows, bevels, inner rims (outside
`press-travel`'s active inset), and glossy highlights are banned —
physicality is suggested by material and motion, never faked.

## Shapes

Everything is squared: `--radius: 0.125rem`, and the Tailwind radius
scale is derived DOWN from it (`rounded-sm` = 0.075rem … `rounded-4xl`
= 0.325rem) — even the "largest" corner reads as a clipped strip. Edges
are 1px hairlines (`--border #c9cbc8`); emphasis edges darken toward ink
(`border-foreground/40–70`) rather than thickening. Recurring geometry:
the strip clip (a 1px-high ink bar at the top edge of every strip), the
full-width HOLD bar, the 80% tick on the credits channel, and the small
squared stepper waypoints. Scrollbars are thin and squared (`border-radius: 0`).

## Components

### The state grammar (state by form)

Four line states — `unplugged / connecting / live / on hold`
(`LINE_STATE_LABELS` is the binding copy). Every state has a distinct
FORM; hue is never the only carrier:

| State | Form | Where |
| --- | --- | --- |
| **live** | `.rule-doubled` (double underline under the name) + the red `bg-stamp` LIVE stamp, exactly one per surface | `IndexRailCard`, `JackCard`, embed label |
| **connecting** | `.stamp-dashed` (1px dashed ink outline) + `.chase-pulse` (1.6s opacity pulse — the ONE moving light on any surface) | stamp slots while publish is in flight |
| **unplugged** | the plain word in `text-muted-foreground` — no stamp at all | everywhere |
| **on hold** | `.hold-bar` — a full-width ink bar crossing the strip (mono, 0.35em tracking, "HOLD") | strip, header panel, whole-board 429 surface |

The `StateLegend` at the rack's foot is the fixed key: each swatch
repeats the state's FORM (plain, dashed, stamp, bar). It is sticky and
never moves. Controls carry engagement by form too: `.press-travel`
depresses 1px with an inset shadow on `:active` (90ms) — a pressed
control looks pressed. `prefers-reduced-motion` stops the chase,
flattens press-travel, and turns the stamp press into an opacity fade.

### Buttons (`ui/button.tsx`)
- **Shape:** squared (`rounded-sm`), h-8 default; all variants carry `press-travel`.
- **`default`** (ink `bg-primary`): primary actions — plug in, sign in, copy.
- **`stamp`** (`bg-stamp`): the NEW LINE lever, `label-mono` copy — the only red control at rest.
- **`outline`** (paper + hairline): cancel, unplug, retry. **`ghost`**: quiet navigation. **`secondary`**, **`destructive`** (stamp-red tint), **`link`** as shadcn defaults.
- **Hover:** tone shifts (`/85`, `/90`) and washes — never elevation.

### Badges (`ui/badge.tsx`) — squared stamps
Mono uppercase (`0.6875rem`, tracking 0.08em), h-5, `rounded-sm`.
`default` = ink-solid word; `secondary` = paper-dim; `outline`/`ghost` =
hairline word; `destructive` = stamp-red tint. The `LineStatePill` maps
the line vocabulary onto these; ingest statuses (`LineDocuments`) stay
quiet (`secondary`/`outline`).

### Progress (`ui/progress.tsx`) — instrument channel
Squared (`rounded-none`), h-1, hairline border, paper-dim track. The
fill is ALWAYS achromatic ink (`indicatorClassName="bg-foreground"`) —
wiring and credit metering are instrumentation, not the live line.
`UsageMeter` adds the 80% boundary tick (a 1px ink mark) and speaks its
status through badges/copy ("Almost out of credits", "On hold"), never color.

### Dialog (`ui/dialog.tsx` + board wrapper `components/dialog.tsx`)
Paper panel (`bg-popover #fbfaf7`, `rounded-sm`, `shadow-paper-lift`)
over a 20% ink veil; footer on `bg-secondary/60` behind a hairline.
Every confirmation is this dialog — never `window.confirm`/`alert`.
Public API `open/onClose/title/children/actions`; `dialog-overlay` /
`dialog-panel` testids ride the primitive's own elements.

### Flight strip (`components/index-rail-card.tsx`)
The rack's unit: a `w-44` paper card (full-width in the lg rack) with
the clip bar, the line name, a `readout-mono` `Docs <n>` readout, and
the state row (stamp / dash+chase / plain word / HOLD bar). Selection =
pulled: `border-foreground/70`, `shadow-strip-pull`, `lg:translate-x-2`,
`aria-current`. Selection lives in the URL (`?line=<chatbotId>`).

### Record header (`components/jack-card.tsx`)
The pulled strip's header: an 11-size stamp block (red LIVE / dashed
chase / empty), the name with `.rule-doubled` when live, the state pill
on the trailing edge, the HOLD bar when held. **Motion:** the ONE
authored moment — on publish (`justPlugged`) the LIVE stamp presses on
with a stiff spring (scale 0.6→1, stiffness 520). Never on resting renders.

### Paper tray (`components/file-dropzone.tsx`)
Paper on hairline; a dragged-over tray OPENS — `bg-accent` +
`border-foreground` — instead of changing hue. Upload progress is a
`readout-mono` % over the achromatic channel. Structured API errors
render in operator language (429 → "On hold") with an outline retry.

### Documents island (`components/line-documents.tsx`)
The wired-in documents with ingest status words in quiet badges. While
any document is `uploaded`/`processing` it polls on the 5s cadence
(`INGEST_POLL_MS`) via `router.refresh()`; uploads refresh immediately.

### Embed generator (`components/embed-snippet.tsx`)
The live-line stamp rides the label; the iframe snippet sits in a
`readout-mono` textarea on paper (select-on-focus); Copy is the board's
only tooltip, and success is the typed readout "Copied." — no motion.

### Credits instruments (`usage-meter.tsx`, `rail-usage.tsx`, `usage-slot.tsx`)
The full meter lives at the rack's foot (`RailUsage`, `usage-slot`
testid); below lg a compact header pill mirrors the exact same status
ladder. 429 from the API IS the on-hold state.

### Stepper (`components/stepper.tsx`)
Squared waypoints (`size-3.5`, 2px border): current = ink fill,
complete = ink/40, future = hairline; cords between sections solidify
once filed; labels in `label-mono`.

### Staged primitives
`Card`, `Input`, `Label`, `Alert`, `Skeleton`, `DropdownMenu`, `Separator`
(header divider) restyle from the same tokens. `motion/react` is
retained only for the stamp press.

## Surfaces

- **`/board`** — the Flight-Strip Control Board: rack + workspace pane,
  selection via `?line=`. Pane = fleet glance (mono figures + state
  swatches), the selected line's detail (`ChatbotDetailHeader` plug/
  unplug, `LineDocuments`, `EmbedSnippet` when live), the 429
  whole-board HOLD surface, or the empty dashed strip slot. The NEW
  LINE lever (`plug-new-line`) anchors the pane's foot.
- **`/board/wizard` → `/documents` → `/review` → `/publish`** — the
  flight-plan: four steps in one fixed panel. Name → wire documents
  (tray) → review (manifest sheet + plan picker) → publish (readout
  summary; plug runs connecting → the stamp press → redirect to the
  board). A 0-ready publish first faces the in-world confirm dialog.
- **`/board/plan`** — tower entries: plans as paper strips with mono
  charge readouts, the credits meter, and the Contact modal (mailto,
  deliberately no checkout). Figures carry a `readout-mono` "SAMPLE
  DATA — pricing not final" note (pricing is undecided in PRODUCT.md).
- **`/login`** — the sign-in log: one paper card on the rack ground,
  `label-mono` heading, one primary button. OAuth2 + PKCE via route handlers.
- **Redirects:** `/` → `/board`; `/board/chatbots/[id]` → `/board?line=<id>`.

## Do's and Don'ts

### Do:
- **Do** carry every line state by its FORM (stamp / dash+chase / plain word / HOLD bar) and keep the sticky legend as the key.
- **Do** set every quantity in mono (`.readout-mono`) and every section mark/stamp in `.label-mono`.
- **Do** keep `--stamp #c8331f` the only saturated color, at stamp/lever scale, one live stamp per surface.
- **Do** keep corners squared — derive any radius from `--radius: 0.125rem`.
- **Do** build confirmations on the paper Dialog, keep copy in English, and pin `color-scheme: light`.

### Don't:
- **Don't** use gradients — the world is flat material, not light effects.
- **Don't** introduce a second saturated color or generic status hues (no green/red status, no Tailwind blue utilities).
- **Don't** encode state in hue alone — if a state reads only by color, it is a bug.
- **Don't** fake physicality: no bevels, no hard offset shadows, no skeuomorphic gloss; only `shadow-strip-pull` and `shadow-paper-lift`.
- **Don't** activate `.dark` — dark mode is an explicit follow-up; the variables exist only for the shadcn contract.
- **Don't** animate beyond the discipline: the connecting chase and the publish stamp press are the only motions (plus press-travel travel).
- **Don't** reintroduce the retired ivory/slate/amber token world — `world-contract.test.ts` guards the retired tokens, hexes, blue utilities, and English-only copy.

---

# The visitor chat (Ask-First Q&A Board)

A second world, deliberately its own: the public route
`/chat/[chatbotId]` (WI-009, direction seed `fb7dfcd1`, tokens in
`apps/web/src/app/chat/[chatbotId]/visitor.css`) serves anonymous
visitors inside a customer's site or a shared link — not operators on
the board. It shares nothing with the Flight-Strip world: no rack metal,
no stamps, no mono instruments, no red. Where the operator world is a
control tower, this is a quiet document that answers questions. Its one
accent is the ink itself.

## Colors — the quiet world

Four tokens, all scoped on `.vchat` so the operator's `:root` variables
are never referenced and never leak in:

- **White ground** (`--v-ground #ffffff`): the whole surface. The visitor world's ground IS white — the inverse of the operator's "ground is not white" rule, by design.
- **Ink** (`--v-ink #1c1e21`): near-black (never pure black) text; also the focus ring (`--v-focus`), the primary button, and the selection highlight (`::selection` is ink with white text — inverted, not tinted).
- **Quiet ink** (`--v-ink-soft #575b60`): secondary text — note, greeting, sources, thinking state, placeholder. 6.9:1 on white.
- **Hairline** (`--v-hairline #e7e7e4`): every divider — card separation, composer frame, source-list left rules.

**The One Lift Rule.** Exactly one soft lift shadow exists on this
surface: the composer (`0 1px 2px rgb(28 30 33 / 0.06), 0 10px 28px
rgb(28 30 33 / 0.07)` — offset + blur, not a halo). Everything else is
flat and hairline-dealt.

**The root-scoped scrollbar.** `scrollbar-color` styles an element's
own scroller, and this page's scroller is the root — so the themed
scrollbar is declared on `html:has(.vchat)` (`scrollbar-color: #575b60 #e7e7e4; scrollbar-width: thin`), scoped by `:has` so it can never
leak into operator surfaces. The values are literal hexes because a root
selector cannot see custom properties scoped on `.vchat`; the `.vchat`
level keeps the same declaration for any inner scroller.

## Typography

Inter only (`--font-sans`), inherited at 1rem / 1.6. There is no mono on
this surface — instrumentation is an operator idea. The ramp is small
and humane: bot name 1.375rem/650 with tight tracking; questions
0.9375rem/600; answers 0.9375rem at 1.65 leading, capped at 68ch;
secondary text and sources 0.8125–0.875rem in quiet ink. Focus rings are
2px ink with 2px offset; the composer's ring lives on the frame
(`focus-within`), not the naked input.

## Components (as built)

- **Server shell** (`layout.tsx`): wraps everything in `.vchat` and
  renders the direction contract as a hidden, `aria-hidden` element —
  React cannot emit a bare comment node, so the seed key `fb7dfcd1` rides
  in the HTML. This is the one `dangerouslySetInnerHTML` on the surface,
  carrying an authored constant, never untrusted text.
- **Public page** (`page.tsx`): `force-dynamic` + `no-store` (never
  prerenders against a build-time backend snapshot); `generateMetadata`
  exposes only the chatbot's name (fallback "Assistant") — no company,
  plan, or document metadata rides this path (R-7).
- **Unavailable state** (`chat-unavailable.tsx`): one calm sentence plus
  one honest possibility, identical for unknown id, draft/archived,
  unreachable API, or malformed body — existence of unpublished bots is
  never leaked (R-6), no status codes anywhere.
- **Client island** (`chat-client.tsx`): the composer leads (textarea,
  Enter sends / Shift+Enter newlines, 2000-char max, auto-grows to
  160px); answered questions stack top-down as document cards — question
  as small heading, grounded answer as body, collapsible `Sources (n)`
  capped at 3 as footnotes with a hairline left rule; the newest card
  carries the thinking state (three breathing dots + the word);
  transient failures auto-retry once after 600ms, then offer a manual
  "Try again" pill at the card (no retry is offered for plan-limit —
  retrying cannot fix that); focus returns to the composer on settle,
  to the retry button on failure.
- **Typed client + visitor copy map** (`lib/chat-public.ts`):
  zod-validated wire shapes, `credentials: 'omit'`, direct calls to
  `NEXT_PUBLIC_API_URL` — never the same-origin BFF proxy, which exists
  to attach the operator's Bearer token. Status codes are consumed here
  and mapped to `VISITOR_ERROR_COPY` (unavailable / plan-limit /
  rate-limit / network) — the single place visitor error language is
  chosen.

**The Document Card Rule.** The question is the heading, the grounded
answer is the body, and the sources are footnotes of the same card.
Cards are dealt by hairlines (`border-top` between items), not boxed.

## Shapes & Motion

Corners are soft here, unlike the board: cards and the composer use
16px radius; the Ask and Try-again controls are pills (999px). Source
list items are marked by a 1px hairline left border, never a colored
slab. Motion is one authored moment — the answer's reveal
(`v-reveal`, 260ms rise, no bounce) — plus the thinking dots' 1.2s
breath; both, and all transitions, go still under
`prefers-reduced-motion`.

## Surfaces

- **`/chat/[chatbotId]`** — the public route and the iframe target the
  publish snippet hands out. Anonymous by design: no auth, no cookies
  (`credentials: 'omit'` on every call), and the root-scroller theme
  keeps the embed (480px frame) reading as the same document. Works from
  320px up; English copy only.
- The auth middleware guards only `/board` and `/board/:path*` —
  `/chat/*` sits outside its matcher, so the visitor route is public and
  anonymous.
- `conversation_id` is an API-issued opaque token kept in a React ref,
  in memory only — never localStorage/sessionStorage (R-5).

## Do's and Don'ts (visitor world)

### Do:
- **Do** keep the document stance: question as heading, grounded answer as body, sources footnoted to the same card.
- **Do** deal cards with hairlines and reserve the single soft lift for the composer.
- **Do** render every failure as calm visitor copy at the card where it happened, with retry-once-then-manual.

### Don't:
- **Don't** borrow operator vocabulary — no rack metal, stamps, mono instruments, `--background`/`--card`/`--stamp` tokens, or red. This world's ink (#1c1e21) is its only accent.
- **Don't** render untrusted text as HTML — answers, source chunks, and the bot name are plain text only; no `dangerouslySetInnerHTML` on visitor data (R-1).
- **Don't** expose status codes, error classes, backend strings, or company blame — `VISITOR_ERROR_COPY` is the only error copy source (R-3).
- **Don't** persist `conversation_id` anywhere — a shared device must never resume a stranger's thread (R-5).
- **Don't** ship a dark mode for this surface — dark mode is not part of this world; it is a white document.
