<!-- SEED: established with the user before implementation; re-run /impeccable document once there's code to capture the actual tokens and components. -->
---
name: chatSaaS
description: Managed document-grounded AI chatbots — the operator's board.
---

# Design System: chatSaaS — The Operator's Board

## Overview

**Creative North Star: "The Operator's Board"**

chatSaaS is a switchboard. The operator — a non-technical small-business owner — plugs a customer's question into their knowledge by connecting two jacks, and the line goes live. The managed infrastructure (the rack, the routing, the machines) is real but invisible; the operator only ever sees labeled jacks, a patch cord, and a lit line. The interface is a calm instrument panel: warm ivory ground, deep slate ink, and a single warm accent that appears only where a line is actually live. Every state reads instantly from the panel's own vocabulary — unplugged, connecting, live, on hold — never from jargon.

This is a workhorse surface, not a spectacle. The visitor came to operate: create a chatbot from their documents, publish it to their site, and know exactly where they stand against their plan and credits. Density is generous and unhurried; nothing glitters except the moment a line goes live. The register is trustworthy, warm, and engineered to feel like a well-kept machine room rather than a startup dashboard.

**Key Characteristics:**
- One warm accent (amber) reserved for the live line; everything else stays achromatic.
- Ivory/cream ground with deep slate ink — light, not dark, built for daytime office use.
- Warm grotesk labels (engraved plate character) over a workhorse sans for data.
- Generous rhythm and quiet density; the interface recedes until a line is live.
- Every bot is a labeled jack on a board; states are line states, never status widgets.

## Colors

The palette is restrained by design: a warm neutral field with a single accent that is rationed to the active path. No secondary or tertiary accents — the system deliberately has one voice. Status is carried by the accent's *presence* (amber = live) and by line-state labels, never by introducing green/red.

### Primary
- **Patch Amber** (`[to be resolved during implementation]`): the patch-cord color. Marks ONLY the live line and the primary create/publish action. It is the rare color; its rarity is the point.

### Neutral
- **Operator's Ivory** (`[to be resolved during implementation]`): the panel ground and card surfaces. Warm, not sterile white.
- **Slate Ink** (`[to be resolved during implementation]`): primary text and the unlit jack bodies.
- **Hairline Slate** (`[to be resolved during implementation]`): borders and dividers.

### Named Rules
**The Live Line Rule.** Patch Amber appears only on the line that is active: the lit jack of a published bot and the primary create/publish control. If amber covers more than a small fraction of a screen, the design has drifted.

## Typography

A warm grotesk for labels and headings — the engraved plate character of a machine room — paired with a workhorse humanist sans for body and data that stays legible at small sizes and high density. Families are `[to be resolved during implementation]`; the character is: labels feel machined and reassuring, data stays calm and readable.

### Hierarchy
- **Display** (`[to be resolved]`): the "Your lines" board title. Bold, generous, unhurried.
- **Headline** (`[to be resolved]`): step and section titles in the create flow.
- **Title** (`[to be resolved]`): bot names on their jack cards.
- **Body** (`[to be resolved]`): helper text and descriptions.
- **Label** (`[to be resolved]`): field labels, jack labels, mono for URLs and embed code.

### Named Rules
**The Jack Label Rule.** Labels read like engraved plate: short, machine-precise, never sentence-long. A label that needs a paragraph is body copy, not a label.

## Layout

The primary surface is **"Your lines"** — a board where each chatbot is a labeled jack in a row. The dominant action is the create/publish control that "plugs in" a new line. The guided create flow moves through four discrete steps (name → documents → review → publish), each occupying the same vertical space so nothing shifts between steps. Desktop-first, generous vertical rhythm, no cloud machinery visible anywhere. Responsive stacking on mobile; exact grid and breakpoints `[to be resolved during implementation]`.

## Elevation & Depth

Flat by default; depth is conveyed through tonal layering on the ivory ground rather than shadows. The one moment of "rise" in the whole system is the lit jack at publish — the only element that visually lifts. Exact shadow/elevation values `[to be resolved during implementation]`.

### Named Rules
**The Flat-by-Default Rule.** Surfaces are flat at rest. The only elevated moment in the system is the live jack at the moment a line is plugged in.

## Shapes

Jack-and-plug geometry: cards are gently rounded rects with a distinct circular "jack" indicator on one edge that reads as the connection point. The create/publish control is the "plug." Exact radius language `[to be resolved during implementation]`.

## Components

No components exist yet in this world; the committed primitives to build in the implementation are the **bot card** (a labeled jack row with a line-state indicator), the **create/plug action**, the **guided create stepper**, and the **usage meter** (plan/credits position). These will be carbonized here by `/impeccable document` once implemented.

## Do's and Don'ts

### Do:
- **Do** keep Patch Amber rare and purposeful — it marks the live line and the primary action only.
- **Do** keep every label and state in the operator's plain language; never expose cloud or infrastructure vocabulary.
- **Do** read states from the line vocabulary (unplugged / connecting / live / on hold) rather than generic status widgets.
- **Do** write all UI copy in English, per the product language commitment.

### Don't:
- **Don't** fall back to the generic blue SaaS dashboard — the ivory/slate/amber board is the committed world.
- **Don't** introduce green or red for status; the amber line and its state label carry meaning alone.
- **Don't** let the retro switchboard theme slip into kitsch — keep it engineered, calm, and restrained.
- **Don't** use multiple accents; the system has one voice.