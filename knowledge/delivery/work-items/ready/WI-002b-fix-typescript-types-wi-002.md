---
type: chore
id: WI-002b
title: "Fix TypeScript type errors in WI-002 backend (lib/db.ts + fastify-zod 1.4.0 API migration)"
knowledge_level: K2
status: draft
phase: next
initiative: "RM-001"
domains:
  - "Backend APIs"
  - "Build and Type Safety"
related_capabilities:
  - "Public chatbot access"
  - "Subscription plan management"
code:
  - "apps/functions/src/lib/db.ts"
  - "apps/functions/src/api/chatPublic.ts"
  - "apps/functions/src/api/creditsBalance.ts"
  - "apps/functions/src/api/creditsDebit.ts"
  - "apps/functions/src/api/creditsReplenish.ts"
  - "apps/functions/src/api/plansAvailable.ts"
  - "apps/functions/src/api/plansSubscribe.ts"
  - "apps/functions/src/api/contentGet.ts"
  - "apps/functions/src/api/hooks.ts"
created_at: 2026-08-27
source: manual
source_id: manual-WI-002b
source_title: "Fix TypeScript type errors in WI-002 backend"
source_context: "After WI-002 implementation landed (commit fa8231a) with 13/13 vitest tests passing, the type-check (`pnpm exec tsc --noEmit -p tsconfig.json`) reports 47 errors. This WI captures the follow-up needed to bring the backend to a green type-check without regressing the existing tests."
source_initiative: "RM-001"
source_roadmap_initiative: "RM-001"
source_work_item_candidate: WI-CANDIDATE-002
source_title: "Fix TypeScript type errors in WI-002 backend"
source_initiative_title: "Public Document-Grounded Chatbot"
expected_value: "`pnpm exec tsc --noEmit -p apps/functions/tsconfig.json` exits 0; runtime behavior of all 7 handlers and 13 tests unchanged; handlers and `lib/db.ts` use the AWS SDK v3.1116 and `fastify-zod` 1.4.0 APIs that match the installed package versions."
risks:
  - "Migration to fastify-zod 1.4.0 `buildJsonSchemas` API is invasive across all 7 handlers — risk of introducing regressions to passing tests."
  - "AWS SDK command classes (`PutItemCommand` etc.) have different `*Input`/`*Output` shapes than the current `PutCommandInput` style — needs careful signature reconciliation for `put`/`get`/`scan`/`update`/`del` helpers."
  - "`marshall`/`unmarshall` import path may have moved between `@aws-sdk/util-dynamodb` and `@aws-sdk/lib-dynamodb` in SDK v3.1116."
  - "Tests currently mock helpers from `@/lib/db`; any change to helper signatures or how handlers import them will need a matching mock update."
dependencies:
  - "WI-002 must remain on a feature branch (currently `feature/WI-002-backend-endpoints`) with green tests."
  - "Package versions in `apps/functions/package.json` are authoritative — do not bump them in this WI."
decision_candidates:
  - id: DC-002b-1
    title: "fastify-zod 1.4.0 migration strategy"
    question: "fastify-zod 1.4.0 removed `ZodTypeProvider` in favor of `buildJsonSchemas` + `register`. How should we adapt?"
    options:
      - "A. Migrate all 7 handlers to `buildJsonSchemas` (real Zod schemas) + `register` — keeps zod validation, adds refactor cost."
      - "B. Drop fastify-zod entirely; use Fastify's built-in JSON schema validation (what's already inline) — no zod, no type provider, simpler."
      - "C. Pin fastify-zod to a pre-1.4 version that still exports `ZodTypeProvider` (requires version check that the rest of the lockfile tolerates)."
    impact: "A keeps validation source-of-truth in Zod; B is the most direct fix; C is a regression risk on future SDK upgrades."
    status: open
  - id: DC-002b-2
    title: "lib/db.ts helper signatures"
    question: "AWS SDK v3.1116 uses PutItemCommand/GetItemCommand/etc. with PutItemInput/Output shapes, not the PutCommandInput-style. Should the helper layer adapt the SDK shape or expose it raw?"
    options:
      - "A. Helpers accept a plain object `{ TableName, Item, Key, ... }` (DynamoDB low-level) — handlers stay simple, helpers do the marshalling."
      - "B. Helpers accept typed inputs per command class (`Omit<PutItemInput, 'TableName'>` + tableName separately) — better type-safety, more verbose at call sites."
      - "C. Re-export the SDK command classes and let handlers call them directly — minimal abstraction, but every handler does its own marshalling."
    impact: "A is closest to current code; B is most type-safe; C removes the wrapper entirely."
    status: open
---

# WI-002b: Fix TypeScript type errors in WI-002 backend

## Context

WI-002 landed with 13/13 vitest tests passing (`pnpm vitest run` green) but
`pnpm exec tsc --noEmit -p apps/functions/tsconfig.json` reports 47 errors
rooted in two API mismatches with the installed package versions:

1. **`@aws-sdk/client-dynamodb` v3.1116** ships `PutItemCommand`, `GetItemCommand`,
   `UpdateItemCommand`, `DeleteItemCommand`, `ScanCommand`, `QueryCommand` (not
   `PutCommand`/`GetCommand` as written). The current `lib/db.ts` imports the
   `PutCommand`/`GetCommand` symbols that don't exist in v3.1116 and uses
   `*CommandInput` type imports that don't match.
2. **`fastify-zod` v1.4.0** removed the `ZodTypeProvider` export. The current
   `withTypeProvider<ZodTypeProvider>()` call in every factory no longer
   type-checks.

The handlers themselves, `db/schema.ts`, and the test file compile-against-the-
mock correctly and run green — the type errors are not catching runtime bugs.
They are a debt that will block `pnpm type-check` in CI and that future
maintainers will trip over.

## Goals

- `pnpm exec tsc --noEmit -p apps/functions/tsconfig.json` exits 0.
- All 13 vitest tests still pass without modification of the assertions.
- `lib/db.ts` uses the AWS SDK v3.1116 commands and input/output shapes.
- All 7 handlers compile under the chosen fastify-zod 1.4.0 strategy
  (or alternative, per DC-002b-1).

## Non-goals

- No new endpoints, no new behaviors.
- No dependency bumps outside what the lockfile already pins.
- No changes to `apps/web/` or to OpenSpec artifacts.

## Acceptance criteria

1. Type-check exits 0.
2. `pnpm vitest run` reports 13/13 tests passing.
3. No new runtime dependencies added to `apps/functions/package.json`.
4. Decision recorded for DC-002b-1 and DC-002b-2 (or marked as resolved by
   implementation).
5. New commit on `feature/WI-002-backend-endpoints` (or a follow-up branch off it)
   with a focused diff and a message that names the two API mismatches fixed.

## Approach (sketch)

1. **Decide DC-002b-2 first** — the AWS SDK command class names must be fixed
   in `lib/db.ts` before the handlers can be type-checked, regardless of the
   fastify-zod decision.
2. **Decide DC-002b-1** — once `lib/db.ts` is correct, the choice is between
   migrating to `buildJsonSchemas` (zod stays), dropping fastify-zod (Fastify
   JSON schema stays), or pinning an older fastify-zod.
3. Apply the chosen migrations to the 7 handlers and `api/hooks.ts`.
4. Re-run tests and type-check until both are green.
5. Commit with a body that names the two API mismatches resolved.
