---
type: feature
id: WI-011
title: "Public chat infra: API GW + Lambda + Bedrock perms for the public chat route"
knowledge_level: K2
status: draft
phase: later
initiative: "RM-001"
domains:
  - "Public Chatbot Delivery"
created_at: "2026-09-08"
updated_at: "2026-09-08"
source: founder-direct-request
---

# WI-011 — Public chat infra: API GW + Lambda + Bedrock perms for the public chat route

## Goal

The public chat route (`POST /api/public/chat/:chatbotId/message`, plus `GET /api/public/chatbots/:chatbotId/config|iframe`) exists only in the local sandbox server (`apps/functions/scripts/sandbox-server.ts`). No CDK construct deploys it: `infra/lib/chat-saas-stack.ts` wires only ingest + Cognito identity. Today the merged main cannot serve a published chatbot in a real deployment.

## Scope

- New construct `PublicChatLambdaConstruct` (`infra/lib/public-chat-lambda.ts`): API Gateway HTTP API (or function URL behind a custom domain) exposing the chat public plugins, no VPC, `ssm:GetParameter` grant on `chatsaas-{env}-neon-url` only (same least-privilege pattern as the ingest Lambda).
- Env wiring: table names (chatbots/conversations/messages/subscriptions/credits), `NEON_URL_PARAMETER_NAME`, Bedrock model IDs, `PUBLIC_CHAT_BASE_URL`.
- Bedrock runtime invoke permissions (`bedrock:InvokeModel`) for the Titan embed + Claude chat models, scoped to the configured model IDs / inference profile ARNs.
- Cognito: none on the public routes (anonymous path, R-1 tenant scoping comes from the chatbot row).
- Stack outputs: public chat base URL for the board's iframe snippet.
- Metering tables (`wi006-subscriptions`, `wi006-credits`) must exist in floci-compatible shape; decide whether the CDK stack also provisions them (they are currently sandbox-managed DDB tables created outside CDK).

## Non-goals

- Custom domain / CloudFront / WAF (follow-up).
- Authenticated chat variants (WI-007 preview path).
- BFF proxying of the public message route (the web BFF proxies `/plans/available` etc.; the visitor chat POSTs the API directly by design).

## Acceptance Criteria

1. `cdk synth` includes the public chat function with `ssm:GetParameter` on `chatsaas-{env}-neon-url` only, no VPC attachment, and Bedrock invoke statements.
2. A deployed smoke: published chatbot → public message POST returns a grounded answer citing Neon pgvector chunks; metering increments land in DynamoDB.
3. `PUBLIC_CHAT_BASE_URL` drives the `iframe_src` the publish step returns.
4. `pnpm -F infra test` green with new assertions.

## Open Questions

- **Q-WI011-1 (open)**: does the public chat Lambda reuse the sandbox-server's Fastify app (`createServer` with a public-only subset) or a dedicated entry bundling only the public plugins? Leans dedicated entry to shrink the bundle and the auth surface.
- **Q-WI011-2 (open)**: who provisions `wi006-subscriptions`/`wi006-credits` in a real account — CDK from this WI or a data-plane bootstrap script (they already gate `checkLimits` by `id = companyId`)?
- **Q-WI011-3 (open)**: API Gateway HTTP API vs Lambda function URL for MVP cost/latency.

## Related Files

- `apps/functions/src/api/chatPublicMessage.ts` — handler to deploy (already Neon-native after `71a6583`).
- `infra/lib/ingest-lambda.ts` — pattern to copy (no VPC, SSM grant, Node runtime, bundling).
- `infra/lib/chat-saas-stack.ts` — composition point.
- `knowledge/tech/decisions/008-use-neon-for-vector-store.md` — data plane.

## Dependencies

- WI-004 (completed): Neon URL parameter + SSM naming convention.
- WI-006 (completed): the route itself (Neon-native).
- SSM SecureString `chatsaas-dev-neon-url` must exist before deploy (pending manual, carried from WI-004).
