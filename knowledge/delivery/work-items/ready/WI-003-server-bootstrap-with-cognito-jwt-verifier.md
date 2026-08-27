---
type: feature
id: WI-003
title: "Server bootstrap with Cognito JWT verifier and route registration"
knowledge_level: K2
status: draft
phase: next
initiative: "RM-001"
created_at: "2026-08-27"
source: judgment-day
source_id: judgment-day-WI-002-round-1
source_title: "Server bootstrap with Cognito JWT verifier and route registration"
source_context: "Derived from Judgment Day Round 1/2 findings on feature/WI-002-backend-endpoints: B-1 (CRITICAL — no production auth, every handler defaults to a shared 'anonymous' tenant) and A-9 (INFO — no server bootstrap wires the 7 factories). The current branch ships 7 isolated handler factories with no Fastify server, no Cognito JWT verification, and no central error handler. Without this WI, the code cannot be deployed to Lambda or any other runtime."
source_initiative: "Public Document-Grounded Chatbot"
expected_value: "A runnable Fastify server that wires the WI-002 handler factories under their `/api/*` prefixes with a Cognito JWT verifier onRequest hook. Public endpoints (chatPublic GET/POST) accept anonymous; admin endpoints (credits*, plans*, content*) reject without a valid Bearer token (401). The server has CORS, a central error handler, request logging, and a single entry point that can be wrapped for Lambda / container deploy."
risks:
  - "Cognito User Pool + JWKS endpoint must exist in the target AWS account before deploy — this WI configures the verifier but does NOT provision the pool."
  - "Production vs test JWT verification paths must not leak — the verifier must fail closed in production and the test path must be clearly isolated."
  - "Wrapping Fastify for AWS Lambda (e.g. `@fastify/aws-lambda` or `lambda-api` adapter) is out of scope for this WI; the server exposes a Node `listen` entry point that a follow-up deploy WI can wrap."
  - "Rate limiting (B-1 sister finding) and request schema validation (already inline JSON schema) are addressed at the spec level; runtime rate limit middleware is out of scope here."
dependencies:
  - "WI-002 (completed) — the 7 handler factories this WI wires."
  - "ADR-001 (Use Amazon Cognito for User Authentication) — already accepted."
  - "ADR-003 (Technology Stack Selection) — Fastify 5.12.1 is the chosen framework."
  - "`@aws-sdk/client-cognito-identity-provider` or a JWT-verifier library must be added; this WI selects and adds it."
code:
  - "apps/functions/src/server.ts"
  - "apps/functions/src/auth/verifyCognitoJwt.ts"
  - "apps/functions/src/auth/claims.ts"
  - "apps/functions/src/auth/__tests__/verifyCognitoJwt.test.ts"
  - "apps/functions/src/api/__tests__/server.integration.test.ts"
related_capabilities:
  - "Company user authentication"
  - "Multi-tenant isolation"
  - "Public chatbot access"
  - "Subscription plan management"
  - "Credit management"
scope_confidence:
  level: high
  reasons:
    - "ADR-001 already commits the project to Cognito. The handler factories already accept a `preHook` that this WI plugs the verifier into. The contract is clear."
    - "Only one open decision: which JWT-verification library to use (jose, jsonwebtoken, or AWS SDK verifier). Listed in decision candidates below."
    - "No new endpoints, no new data model. Pure wiring + auth layer."
impact_analysis:
  surfaces:
    frontend:
      status: affected
      reason: "Frontend will need to attach `Authorization: Bearer <token>` on every admin request — the existing frontend scaffold in apps/web/ must wire to the Cognito Hosted UI or a SDK helper. Out of scope here, but the contract is established."
    backend:
      status: affected
      reason: "The 7 handler factories currently take a `preHook?: UserPreHook` parameter; this WI removes the optionality and makes the auth hook mandatory at the server bootstrap layer. Handlers are not modified except for removing the `'anonymous'` fallback."
    database:
      status: not-applicable
    configuration:
      status: affected
      reason: "New env vars: `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_REGION`. Optional `AUTH_DISABLED=true` for local dev only (must be false in production)."
    authentication:
      status: affected
      reason: "This WI implements the missing Cognito verification that ADR-001 commits to."
    notifications: not-applicable
    analytics: not-applicable
    documentation:
      status: affected
      reason: "Add a short README section in apps/functions/ documenting the auth contract and the env vars."
    operations:
      status: affected
      reason: "Cognito User Pool must be provisioned (out of scope here) and the JWKS endpoint reachable from the Lambda runtime."
module_coverage:
  agents:
    status: reviewed-not-affected
  backend:
    status: affected
  api:
    status: affected
decision_candidates:
  - id: DC-003-1
    title: "JWT verification library"
    question: "Which library verifies the Cognito JWT signature and claims?"
    options:
      - "A. `jose` (panva) — modern, isomorphic, supports JWK rotation out of the box, ~30kB, zero deps on AWS SDK. Recommended for Node + Lambda cold start budget."
      - "B. `jsonwebtoken` + `jwks-rsa` — older but ubiquitous. Requires manual JWKS caching."
      - "C. `@aws-sdk/client-cognito-identity-provider` `getUser`/`getUserAttributeVerificationCode` — heavy SDK, not designed for stateless verification; rejects on Lambda without SDK caching."
    impact: "A is the right call for a serverless backend: small, fast cold start, no SDK lock-in. C is overkill."
    status: open
  - id: DC-003-2
    title: "Public endpoint authentication"
    question: "How are public endpoints (chatPublic GET/POST) distinguished from admin endpoints?"
    options:
      - "A. White-list routes in the server bootstrap. The preHook verifies JWT for everything except `/api/chat/public/*`; public routes skip the verifier."
      - "B. Make the preHook verifier a no-op for routes with a `meta: { public: true }` flag set on the Fastify route schema."
      - "C. Two separate Fastify instances / sub-apps: one public, one behind auth."
    impact: "A is the most direct. B is more declarative. C is overkill for a single binary."
    status: open
  - id: DC-003-3
    title: "Mandatory vs optional preHook"
    question: "The handler factories currently treat the preHook as optional. After this WI, should it be required?"
    options:
      - "A. Drop the `?` from the factory signature. The server bootstrap always passes a hook. Tests that called the factory without one update accordingly."
      - "B. Keep it optional but make the server bootstrap refuse to start if a public route is registered without a hook (defense in depth)."
      - "C. Keep it optional and document that omitting it ships a shared-anonymous tenant in production."
    impact: "A is the safest. B leaves a footgun. C is what we have today and is exactly what the JD flagged."
    status: open
refined_by: work-item-agent
---

# WI-003: Server bootstrap with Cognito JWT verifier and route registration

## Context

WI-002 produced seven isolated Fastify handler factories (`chatPublic`, `creditsBalance`, `creditsDebit`, `creditsReplenish`, `plansAvailable`, `plansSubscribe`, `contentGet`) plus a `UserPreHook` type that lets tests inject a fake `request.user.sub`. The factories are unit-tested (19/19 passing) but **nothing in the codebase wires them into a runnable server**, and the only auth hook in `apps/functions/src/api/hooks.ts` is the test-only `fakeUserHook`.

Judgment Day Round 1/2 on WI-002 surfaced two blocking findings that this WI closes:

- **B-1 (CRITICAL)**: No production authentication. Every handler reads `(request as any).user?.sub || 'anonymous'`, so an unauthenticated request coalesces onto a single shared `anonymous` tenant. A misconfigured deploy that forgets to register a hook would silently merge every unauthenticated user into one account.
- **A-9 (INFO)**: No server bootstrap. The branch ships a library of endpoint builders, not a service. Reviewers must know these are inert until the integration task lands.

This WI provides the missing wiring: a runnable Fastify server, a Cognito JWT verifier, a route registration that distinguishes public vs admin endpoints, and a defense-in-depth check that the server refuses to start if a route is registered without an auth hook.

## Goals

1. Add a `verifyCognitoJwt` hook that uses the Cognito JWKS to verify the `Authorization: Bearer <token>` header. The verified claims are attached to `request.user`.
2. Add a `server.ts` that wires the seven factories under their `/api/*` prefixes with the verifier on admin routes.
3. Make the preHook mandatory: factories are updated to require a hook (no `?` optional). Tests and handlers that depended on the `'anonymous'` fallback are updated to assert a real user is present (return 401 otherwise) for admin routes.
4. Public routes (`/api/chat/public/*`) skip the JWT verifier but still run a small allowlist.
5. Add a central error handler that maps unhandled errors to 500 with a stable envelope and logs the request context.
6. Add CORS so the future dashboard can call the API from a different origin (defaults locked down, configurable via env).
7. Add tests:
   - Unit tests for `verifyCognitoJwt` (valid token, expired, wrong audience, wrong issuer, missing header, malformed).
   - Integration test for the assembled server: admin route returns 401 without token, returns 200 with a valid token, public route returns 200 anonymously.

## Non-goals

- Provisioning the Cognito User Pool (IaC / Terraform). Out of scope — this WI configures the verifier; the pool itself is created separately.
- Deploying to AWS Lambda (`@fastify/aws-lambda` adapter). Out of scope — the server exposes a Node `listen` entry point that a follow-up deploy WI can wrap.
- Payment-webhook signature verification (separate WI — see Judgment Day B-2 for the rationale).
- Rate limiting (separate WI — `api-spec.md` mentions it, not implemented here).
- Frontend wiring to call the API with the token (separate WI in apps/web/).
- Migrating subscriptions off the userId+planId composite key (separate WI from Judgment Day A-17).

## Acceptance criteria

1. `apps/functions/src/auth/verifyCognitoJwt.ts` exists, exports a `verifyCognitoJwt` factory that takes a `VerifierConfig` and returns a `UserPreHook`.
2. `apps/functions/src/server.ts` exists, exports `createServer(deps?)` that returns a configured Fastify instance with all 7 routes registered. Also exports `startServer()` for direct `node` execution.
3. `pnpm exec tsc --noEmit -p apps/functions/tsconfig.json` exits 0.
4. `pnpm vitest run` reports at minimum the 19 existing tests still pass plus 8+ new tests (1 per verifyCognitoJwt scenario + 3 server integration tests).
5. Admin routes (`/api/credits/*`, `/api/plans/*`, `/api/content/*`) return 401 when no `Authorization` header is present, and 200 with a valid token in tests.
6. Public routes (`/api/chat/public*`) return 200 without any token.
7. `pnpm dev` (a new `scripts.dev` entry) starts the server on port 3001 by default and logs the route table on boot.
8. `kaddo guard` exits 0 after the change.
9. DC-003-1, DC-003-2, DC-003-3 are resolved and recorded in the frontmatter.
10. `package.json` adds the chosen JWT library; `pnpm install` regenerates the lockfile cleanly.

## Approach (sketch)

1. **DC-003-1 → A (jose)**. Add `jose@^5` to `apps/functions/package.json` dependencies. Implement `verifyCognitoJwt` using `jose.jwtVerify` with `createRemoteJWKSet` for the Cognito JWKS.
2. **DC-003-2 → A (allowlist)**. In `server.ts`, define a `PUBLIC_ROUTES` set; the global preHook checks the route and skips JWT verification for those.
3. **DC-003-3 → A (mandatory)**. Drop the `?` from the factory signatures. Handlers that previously fell back to `'anonymous'` (chatPublic) keep the fallback; admin handlers return 401 when `request.user` is missing.
4. **Handler updates**:
   - `chatPublicFactory(preHook)` — keep the public fallback to `anonymous` because the spec says public is anonymous.
   - `creditsBalanceFactory`, `creditsDebitFactory`, `creditsReplenishFactory`, `plansAvailableFactory`, `plansSubscribeFactory`, `contentGetFactory` — drop the `'anonymous'` fallback; require `request.user.sub`. Return 401 when absent.
5. **Test updates**: the existing 19 tests use `userHook` (test fake) so they continue to pass; new server-integration test covers the assembled server with a stubbed verifier.
6. **Add a `fastify-cors` configuration** locked down to `ALLOWED_ORIGINS` env var (comma-separated), defaulting to localhost in dev.
7. **Error handler**: maps `ZodError` to 400, unhandled errors to 500, and logs `{requestId, method, url, error}` to `fastify.log`.

## Out-of-scope follow-ups (to be tracked as separate WIs after this lands)

- **WI-004: Lambda deploy adapter** — wrap `createServer` for `@fastify/aws-lambda` and configure the Lambda handler in `cdk` / `sam` / `terraform`.
- **WI-005: OpenAPI security drift** — apply `security: [bearerAuth: []]` to admin paths in the OpenAPI YAML and ensure `securitySchemes.bearerAuth` is consumed.
- **WI-006: Cognito User Pool provisioning** — Terraform/CDK to create the pool, the app client, and the IAM roles.
- **WI-007: Payment webhook signature** — for `creditsReplenish` when invoked from a payment provider (separate from the dashboard `POST /replenish` flow which is admin-only).
- **WI-008: Rate limiting** — per-IP and per-tenant rate limits per `api-spec.md`.
