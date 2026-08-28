# Decision Candidates

Generated from Kaddo Context Pack.

## AWS Service Selection for AI Capabilities

**Status:** CLOSED 2026-08-28 → see `knowledge/tech/decisions/004-aws-service-selection-for-ai-capabilities.md`.

**Resolution:** Amazon Bedrock (Claude 3.5 Sonnet + Titan Embeddings v2) for AI, **Aurora Serverless v2 + pgvector** for vector storage, **in-Lambda** loaders (pdf-parse + mammoth + LangChain) for parsing, RDS Proxy in front of the cluster, Secrets Manager with 7-day rotation. OpenSearch Serverless, Textract, DynamoDB vectors, and third-party managed vector stores were rejected (see ADR-004 for the full cost and trade-off analysis).

---


---
## Cost Attribution and Billing Mechanism

**Status:** CLOSED 2026-08-24 → see `knowledge/tech/decisions/005-cost-attribution-and-billing-mechanism.md`.

**Resolution:** Hybrid. AWS Cost Allocation Tags for infrastructure cost visibility, application-level metering in DynamoDB for product metrics (conversations, document processing volume, chatbot count). Tenant cost attribution is the internal margin view; the customer-facing price is a monthly subscription with optional prepaid credits (see DC-002 in business knowledge).

---


---
## Data Partitioning Strategy for Tenant Isolation

**Status:** CLOSED 2026-08-22 → see `knowledge/tech/decisions/006-data-partitioning-strategy-for-tenant-isolation.md`.

**Resolution:** Single Aurora cluster, single `public` schema, `company_id` and `chatbot_id` columns on every table, HNSW index on the embeddings column, with `WHERE company_id = $1 AND chatbot_id = $2` enforced on every query path. Tenant filtering is a SQL JOIN, not a separate architectural concern.

---


---
## Document Parsing Strategy

**Status:** CLOSED 2026-08-28 → see ADR-004.

**Resolution:** In-Lambda parsers (`pdf-parse` for PDF, `mammoth` for DOCX, `@langchain/community/document_loaders` for the rest). No managed OCR service. Scanned PDFs are a deferred upgrade: when a customer needs OCR, a Textract fallback becomes a single-file change in the parser module.

---

## Application Architecture Style

**Context:**
As a new MVP platform, chatSaaS needs to choose an application architecture that balances development speed, operational simplicity, and future scalability. The decision impacts how the system will be developed, deployed, and maintained over time.

**Possible decision:**
Adopt a modular monolith architecture for the MVP, with clear module boundaries corresponding to the core domains (Auth, Chatbot Management, AI Processing, Billing, etc.), deployed as a single deployable unit but designed for eventual decomposition if needed.

**Alternatives:**
- Microservices architecture with independent services for each domain
- Traditional monolithic architecture with all functionality coupled
- Serverless architecture using AWS Lambda functions with managed services
- Event-driven architecture with services communicating via messaging queues

**Impact:**
Affects development speed, team structure, deployment complexity, scaling characteristics, fault isolation, and long-term maintainability.

**Urgency:**
Medium - important for long-term maintainability but MVP can start with a simpler approach that evolves over time.

**Affected areas:**
Codebase structure, Deployment strategy, Inter-service communication, Development workflow, Team organization, Scaling approach, Technology stack choices

**Validation needed:**
Evaluation of team expertise with different architectures, prototyping to assess development velocity, analysis of scaling requirements, consideration of future evolution paths.

---
## Usage Limits and Enforcement

**Context:**
chatSaaS needs to define numeric limits for conversations, chatbots, and document volume per plan, plus enforcement behavior that keeps usage predictable for non-technical customers without surprise charges.

**Possible decision:**
Adopt a hybrid enforcement model: a soft warning at 80% of the monthly limit and a hard block at 100%, with the option to purchase additional credits when credits are enabled. If credits are disabled, block new conversations at the limit without invoking the AI.

**Alternatives:**
- Hard limits: block further usage when the quota is exceeded (no overage path).
- Soft limits: allow overage with additional charges or notifications.
- Rolling window vs. calendar-month reset periods.
- Enforced exclusively via application-level metering in DynamoDB.

**Impact:**
Shapes user experience, revenue model, and billing system complexity.

**Urgency:**
Medium - needed for MVP launch but can iterate post-launch.

**Affected areas:**
Usage Metering & Billing module, Subscription plan enforcement, Conversation management, Credit system.

**Validation needed:**
Enforcement tests at 80%/100%, evaluation of reset-period behavior, verification that blocking never follows an AI invocation.

---
## Credit System Implementation

**Context:**
chatSaaS supports an opt-in prepaid credit system that extends usage beyond subscription plan limits. The billing unit is the completed conversation (not per message), with alerts at 80% and 100% and blocking at zero balance.

**Possible decision:**
Implement a prepaid credit ledger in DynamoDB using atomic counters for credit balances, with a transaction log recording every debit and purchase for auditability.

**Alternatives:**
- RDS (PostgreSQL/MySQL) with a transactional credit ledger.
- Event sourcing pattern with a credit transaction log.
- Third-party billing integration (Stripe, Chargebee) for credit management.

**Impact:**
Affects system reliability, auditability, and billing integration complexity.

**Urgency:**
Medium - needed for monetization but can start with a simpler model.

**Affected areas:**
Usage Metering & Billing module, Credit ledger, Billing system integration, Conversation management.

**Validation needed:**
Atomicity and concurrency tests for balance updates, purchase flow validation, audit trail verification.

---
## Observability and Monitoring Approach

**Context:**
chatSaaS needs comprehensive observability to monitor system health, debug issues, track performance, and ensure service reliability. As a public-facing platform handling customer data and providing AI services, effective monitoring is crucial for both operational excellence and security.

**Possible decision:**
Adopt an AWS-native observability stack using CloudWatch Logs for logging, CloudWatch Metrics for monitoring, and X-Ray for distributed tracing, enhanced with Contributor Insights for anomalous behavior detection.

**Alternatives:**
- Open-source observability stack (Prometheus, Grafana, Loki, Tempo) self-managed or via managed services
- Third-party observability platforms (Datadog, New Relic, Splunk, etc.)
- Hybrid approach combining AWS infrastructure monitoring with application-level logging to external services
- Lightweight approach using basic CloudWatch with application logs stored in S3

**Impact:**
Affects debuggability, performance tuning capacity, operational visibility, alerting effectiveness, and cost of monitoring solution.

**Urgency:**
Low-Medium - basic logging needed early but sophisticated observability can evolve with the system.

**Affected areas:**
All system components, Logging implementation, Metrics collection, Tracing instrumentation, Alerting system, Dashboard development, Incident response procedures

**Validation needed:**
Evaluation of native AWS service capabilities against requirements, cost comparison of different options, assessment of operational overhead for each approach, validation of integration complexity with chosen stack.

---

## WI-005 Decision Candidates (Ingest Pipeline)

### DC-005-1 — Sub → company_id mapping location

**Status:** RESOLVED 2026-08-28 → option D (chain of custody in WI-008).

**Resolution:** The mapping's chain of custody lives in WI-008: its post-confirmation Lambda is the sole writer of the immutable `custom:company_id` attribute, SignUp rejects client-supplied values for it (write-attribute whitelist excludes it on the User Pool Client), and the pre-token-generation Lambda copies the claim server-side. With WI-008's AC-13 + AC-14 in place, the JWT `custom:company_id` is trustworthy for tenant authorization. `apps/functions/src/ingest/resolveTenant.ts` reads the JWT claim directly and references WI-008's AC-13 + AC-14 in a source comment. The `auth/claims.ts` SECURITY NOTE is updated during implementation to describe the custody chain.

**Migration path:** When multi-org growth appears (one user belongs to multiple companies), `resolveTenant` migrates to a DynamoDB `users` table. The change is localized to one module; the WI-008 custody chain remains the source of truth at sign-up.

**Cross-reference:** `knowledge/delivery/work-items/draft/WI-005-ingest-pipeline.md`, `knowledge/delivery/work-items/draft/WI-008-cognito-user-pool.md`.

---

### DC-005-2 — Bedrock embed model id exact string

**Status:** RESOLVED 2026-08-28 → `amazon.titan-embed-text-v2:0` (8k context default).

**Resolution:** The env var `BEDROCK_EMBED_MODEL_ID=amazon.titan-embed-text-v2:0` carries the value. No regional suffix. The model is enabled in the baseline region (us-east-1). If a longer context is needed later, the env var is the only change.

**Cross-reference:** `knowledge/tech/decisions/004-aws-service-selection-for-ai-capabilities.md`.

---

### DC-005-3 — Chunk size + overlap defaults

**Status:** RESOLVED 2026-08-28 → 1000 chars / 200 overlap.

**Resolution:** Env vars `CHUNK_SIZE=1000` and `CHUNK_OVERLAP=200`. Tunable per chatbot at deploy time. Cost estimate: ~1500 chunks / 10 MB PDF, ~$0.005 / doc with Titan v2 batched at 25 per call.

**Cross-reference:** `knowledge/delivery/work-items/draft/WI-005-ingest-pipeline.md` (Task 9).

---

### DC-005-4 — S3 bucket placement

**Status:** RESOLVED 2026-08-28 → bucket lives in WI-005.

**Resolution:** `infra/lib/ingest-bucket.ts` is added to WI-005. WI-004 stays focused on Aurora+pgvector+proxy. The construct is small and isolated; either location is fine; this is the choice.

**Cross-reference:** `knowledge/delivery/work-items/draft/WI-005-ingest-pipeline.md` (Task 2).

---

### DC-005-5 — RDS connection path for the Lambda

**Status:** RESOLVED 2026-08-28 → RDS Data API for v1.

**Resolution:** No connection management, IAM auth, faster cold start. The env var `DB_CONNECTION_MODE` defaults to `data_api`; a `pg` mode (raw through RDS Proxy) is a fallback if the `::vector` cast is rejected by the Data API SQL dialect during implementation. The choice is a single env var.

**Cross-reference:** `knowledge/delivery/work-items/draft/WI-005-ingest-pipeline.md` (Task 6).

---

## WI-006 Decision Candidates (Retrieval + Chat)

### DC-006-1 — Bedrock chat model id exact string

**Status:** RESOLVED 2026-08-28 → `anthropic.claude-3-5-sonnet-20240620-v1:0` (cross-region inference profile if available).

**Resolution:** Env var `CHAT_MODEL_ID` carries the value. Switchable per chatbot via env override.

**Cross-reference:** `knowledge/delivery/work-items/draft/WI-006-retrieval-chat.md` (Task 8).

---

### DC-006-2 — Default system prompt

**Status:** RESOLVED 2026-08-28 → both layers (per-chatbot seed + env fallback).

**Resolution:** The chatbot's `settings.system_prompt` is seeded at creation time (via the wizard's review step) and the env var `CHAT_SYSTEM_PROMPT_DEFAULT` is the fallback when the per-chatbot value is empty.

**Cross-reference:** `knowledge/delivery/work-items/draft/WI-006-retrieval-chat.md` (Task 7).

---

### DC-006-3 — top-K default

**Status:** RESOLVED 2026-08-28 → 10.

**Resolution:** Env var `CHAT_TOP_K=10`. Tunable per chatbot at deploy time. Balance recall/cost as estimated in the proposal.

**Cross-reference:** `knowledge/delivery/work-items/draft/WI-006-retrieval-chat.md` (Task 6).

---

### DC-006-4 — Rolling context N

**Status:** RESOLVED 2026-08-28 → N=4.

**Resolution:** Env var `CHAT_CONTEXT_TURNS=4`. Sufficient for the 90% case; revisit with the first pilot customer's conversation logs.

**Cross-reference:** `knowledge/delivery/work-items/draft/WI-006-retrieval-chat.md` (Task 7).

---

### DC-006-5 — 402 vs paid-overage semantics

**Status:** RESOLVED 2026-08-28 → hard 402 block at 100%.

**Resolution:** Coherent with `knowledge/business/business.md`. The handler never serves beyond the limit even if prepaid credits are exhausted; the visitor sees the 402 surfaced by the widget. No soft-warning banner.

**Cross-reference:** `knowledge/business/business.md`, `knowledge/delivery/work-items/draft/WI-006-retrieval-chat.md` (Task 3).

---

## WI-007 Decision Candidates (Operator's Board)

### DC-007-1 — Visual design tokens

**Status:** RESOLVED 2026-08-28 → defaults committed.

**Resolution:** Committed in `apps/web/tailwind.config.ts` and `apps/web/src/app/globals.css` during T-02. The impeccable scan step at build finish records the actual values used per ADR-007 §Implementation Path step 5.

| Token | Value |
|---|---|
| Patch Amber | `#B8860B` (dark goldenrod) |
| Operator's Ivory | `#F8F4E9` (warm cream) |
| Slate Ink | `#2D3142` (deep slate) |
| Hairline Slate | `#D6D2C4` |
| Workhorse sans | Inter (open source, system fallback) |
| Mono labels | IBM Plex Mono |

**Cross-reference:** `knowledge/tech/decisions/007-visual-design-system.md`, `apps/web/DESIGN.md`, `knowledge/delivery/work-items/draft/WI-007-operators-board.md` (Task 2).

---

### DC-007-2 — Publish with 0 ready documents

**Status:** RESOLVED 2026-08-28 → permissive with confirmation.

**Resolution:** The 'Continue' button is enabled; clicking it without ≥1 ready document opens a confirmation dialog explaining the trade-off; confirming proceeds to publish. Strict-mode (disable until ≥1 ready) is a follow-up toggle.

**Cross-reference:** `knowledge/delivery/work-items/draft/WI-007-operators-board.md` (Task 11).

---

### DC-007-3 — Prepayment flow

**Status:** RESOLVED 2026-08-28 → "Contact us" modal placeholder for MVP.

**Resolution:** The button on the plan page opens a modal with the text "Contact us at hello@chatsaas.example to add prepaid credits." Real Stripe checkout is a separate WI.

**Cross-reference:** `knowledge/delivery/work-items/draft/WI-007-operators-board.md` (Task 14).

---

### DC-007-4 — Dark mode scope

**Status:** RESOLVED 2026-08-28 → NOT in this WI.

**Resolution:** Per ADR-007's committed world (ivory/light by default, "not dark mode as default"). The Tailwind config keeps the dark-mode variant hooks present so the follow-up is a small one. No dark mode rendering in this WI.

**Cross-reference:** `knowledge/tech/decisions/007-visual-design-system.md`.

---

### DC-007-5 — `useHydrated` strategy for nested client components

**Status:** RESOLVED 2026-08-28 → per-component guard.

**Resolution:** Each store-consuming component wraps its client-only render in a `useHydrated` check. The helper lives at `apps/web/src/lib/use-hydrated.ts` and is the canonical guard for the codebase. The alternative (global provider) is documented as a follow-up if the boilerplate becomes a maintenance burden.

**Cross-reference:** `knowledge/delivery/work-items/draft/WI-007-operators-board.md` (Task 9).

---

## WI-008 Decision Candidates (Cognito User Pool)

### DC-008-1 — `companies` table location

**Status:** RESOLVED 2026-08-28 → option B (owned by CDK construct).

**Resolution:** The table is provisioned in `infra/lib/lambda/companies-table.ts` and `apps/functions` reads the table name from a CDK stack output. The `apps/functions/src/db/schema.ts` registry gets a `TABLES.COMPANIES` constant that points at the output. Lifecycle belongs to the identity stack for the MVP; a follow-up WI can consolidate schema ownership once the convention is clearer.

**Cross-reference:** `knowledge/delivery/work-items/draft/WI-008-cognito-user-pool.md` (Task 1, 2).

---

### DC-008-2 — Admin allowlist mechanism

**Status:** RESOLVED 2026-08-28 → hybrid (A for dev, B for prod).

**Resolution:** Dev stacks use a hardcoded allowlist in CDK context (visible in synth, easy to review). Prod uses the SSM parameter `/chatsaas/{envName}/admin-allowlist`, read at deploy time. The construct picks the source based on `envName`. The deploy runbook documents the `aws ssm put-parameter` step.

**Cross-reference:** `knowledge/delivery/work-items/draft/WI-008-cognito-user-pool.md` (Task 6).

---

### DC-008-3 — MFA scope

**Status:** RESOLVED 2026-08-28 → optional for `customer`, required for `admin`.

**Resolution:** `admin` group membership triggers the pre-token-generation TOTP throw. `customer` users may enroll in TOTP optionally but are not required to. The product call is documented in the proposal.

**Cross-reference:** `knowledge/delivery/work-items/draft/WI-008-cognito-user-pool.md` (Task 3, 8).

---

### DC-008-4 — Hosted UI vs custom UI

**Status:** RESOLVED 2026-08-28 → hosted UI for MVP.

**Resolution:** Default Cognito hosted UI with the standard logo and a placeholder CSS. The custom sign-in/sign-up page in `apps/web/` (with the chatSaaS branding per ADR-007) is a follow-up WI that consumes this WI's stack outputs and replaces the hosted-UI redirect.

**Cross-reference:** `knowledge/delivery/work-items/draft/WI-008-cognito-user-pool.md` (Task 3, 4, 5).

---

### DC-008-5 — Region for the User Pool

**Status:** RESOLVED 2026-08-28 → same region as Aurora (us-east-1 default).

**Resolution:** The User Pool, Aurora, and the rest of the stack are in the same region. Bedrock is enabled in `us-east-1`. Multi-region split is a follow-up WI; the construct's region-agnostic design keeps that follow-up localized.

**Cross-reference:** `knowledge/tech/decisions/004-aws-service-selection-for-ai-capabilities.md`, `knowledge/delivery/work-items/ready/WI-004-cdk-app-bootstrap-with-aurora-pgvector.md`.