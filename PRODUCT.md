# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: staff at small and medium businesses (non-technical, no cloud or AI expertise) who need a customer-facing AI assistant on their company website. They self-register, upload company documents, and publish a public chatbot without engineering help. Their situation: they want it working today, not after a development project.

Secondary (confirmed): website visitors who chat with a published bot to get answers grounded in that company's documents.

## Product Purpose

chatSaaS lets any company create a document-grounded public AI chatbot (RAG over its uploaded documents, with general-conversation fallback) and publish it in minutes via a hosted URL or an iframe embed. Success means a non-technical user goes from signup to a live embedded chatbot unaided, while chatSaaS operates all underlying AWS infrastructure on their behalf.

## Positioning

A working, publicly embeddable AI chatbot built from your own documents in minutes — with zero cloud expertise required, because chatSaaS provisions and operates all of AWS for you. Generic bot builders can copy "upload docs, get a bot"; none offer fully managed, policy-isolated AWS infrastructure billed as a simple monthly plan.

## Operating Context

- Self-service web dashboard used by company admins; visitors chat from the company's public site through an embedded iframe.
- Customer-uploaded documents are processed into a retrieval index; chat answers must be grounded in those documents.
- chatSaaS pays AWS costs and bills companies monthly; metered usage (conversations, chatbots, document volume) drives plan limits.

## Capabilities and Constraints

Confirmed for MVP (WI-001):
- Public document-grounded chatbots only; internal/authenticated chatbots are out of scope for MVP.
- Publishing means a hosted public chat page URL plus an iframe embed snippet. No JS widgets, no webhooks, no external actions or API calls from bots.
- Amazon Cognito authenticates company customers; direct SDK integration (no Amplify).
- Shared AWS resources with per-tenant isolation enforced by IAM policies, not per-tenant stacks.
- Billing: monthly subscription plans limiting conversations/month, number of chatbots, and document volume processed. Opt-in prepaid credits extend usage; the billing unit is the completed conversation (not per message); alerts fire at 80% and 100%; new conversations are blocked at the limit or zero balance without ever invoking the AI.

Explicitly undecided (do not invent): numeric plan limits and pricing tiers; credit price, expiry, and refunds; cost-attribution tagging scheme (DC-002 candidate); Bedrock model selection per tier.

## Brand Commitments

- Name: chatSaaS (no logo or visual identity exists yet).
- Voice: simple, trustworthy, jargon-free — the product promises "no cloud expertise needed", so UI copy must never leak AWS terminology to end customers.
- Language: product UI copy in English for MVP (founder converses in Spanish; generated artifacts default to English).

## Evidence on Hand

- Greenfield: no customers, testimonials, case studies, benchmarks, press, or metrics exist. Do not fabricate logos, quotes, usage numbers, or uptime claims.
- Real assets: Kaddo knowledge base under `knowledge/` (business, product, tech ADR-001..003, delivery WI-001 and RM-001).

## Product Principles

1. Self-service above all: a non-technical user reaches a live public chatbot unaided; anything requiring an engineer is a bug.
2. Hide the cloud: AWS complexity is chatSaaS's job; customers see documents, bots, and plans — never infrastructure.
3. Grounded honesty: bots answer from company documents; when the documents lack the answer, the bot says so instead of improvising.
4. Predictable usage: customers always know where they stand against plan limits and credits; blocking happens before surprise costs, never after invoking the AI.
5. Trust before scale: tenant isolation and document privacy are non-negotiable even on shared infrastructure.
