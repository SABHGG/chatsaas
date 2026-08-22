---
type: feature
id: WI-001
title: "Define public chatbot creation and publishing"
knowledge_level: K2
status: ready
phase: now
initiative: "RM-001"
domains:
  - "Public Chatbot Delivery"
related_domain: "Public Chatbot Delivery"
related_capabilities:
  - "Public chatbot access"
  - "Iframe embedding"
  - "Company document knowledge"
  - "Conversational responses"
code: []
created_at: 2026-08-22
source: roadmap
source_id: WI-CANDIDATE-001
source_initiative: RM-001
source_roadmap_initiative: RM-001
source_work_item_candidate: WI-CANDIDATE-001
source_title: "Define the first public chatbot creation and publishing experience"
source_context: "Materialized from roadmap candidate WI-CANDIDATE-001 under initiative RM-001."
source_initiative_title: "Public Document-Grounded Chatbot"
expected_value: "A company can create a public chatbot backed by its documents and receive a shareable URL and iframe embed option."
risks:
  - "AWS service selection, document retrieval, policy-based tenant isolation, and cost attribution remain undecided."
dependencies:
  - "Technical decisions on AWS architecture and cost attribution before implementation."
source_signals:
  - "Business Goal: Let companies publish a document-grounded chatbot without manually configuring AWS."
  - "Capability Gap: No public chatbot creation and delivery flow exists."
decision_candidates:
  - "DC-002: Tenant Usage Metering and Subscription Limits"
related_decisions: []
scope_confidence:
  level: low
  reasons:
    - "The user-visible MVP outcome is clear, but AWS architecture and cost attribution remain undecided."
impact_analysis:
  surfaces:
    frontend:
      status: unknown
      question: "What company administration and public chat surfaces are required?"
    backend:
      status: unknown
      question: "What orchestration and conversation services are required?"
    database:
      status: unknown
      question: "What data must be retained for companies, documents, agents, and conversations?"
    configuration:
      status: affected
      reason: "AWS connection and deployment configuration are central to the product promise."
    authentication:
      status: affected
      reason: "Company user authentication uses Amazon Cognito User Pools; users self-register and chatSaaS accounts are created automatically."
    notifications:
      status: not-applicable
    analytics:
      status: unknown
      question: "What usage and answer-quality signals are needed for MVP validation?"
    documentation:
      status: affected
      reason: "Companies need instructions to use the public URL and iframe embed."
    operations:
      status: unknown
      question: "What deployment, monitoring, and support model is required?"
module_coverage:
  agents:
    status: reviewed-not-affected
    reason: "The existing module contains Kaddo agent guidance, not product code."
summary: "Define the observable MVP flow for creating and publishing a public, document-grounded chatbot."
refined_by: work-item-agent
---

# Define public chatbot creation and publishing

> Type: feature · Level: K2

## Actor and Outcome

A company user (the person who subscribed to chatSaaS) creates a public chatbot from company 
documents and receives a public URL and iframe embed option so website visitors can ask questions.

**Note:** Company users authenticate via Amazon Cognito User Pools with self-service registration.

## Current Behavior

No product or public chatbot creation flow exists.

## Target Behavior

The MVP supports a company-owned, public chatbot that answers questions using supplied documents
and can also handle general conversation. The company can share its URL or embed it in a website
with an iframe.

## Entry Points

- Company user dashboard for creating and publishing a chatbot.
- Public chatbot URL.
- Iframe embedded on a company website.

## End-to-End Flow

1. A company user registers with Amazon Cognito, creating their chatSaaS account.
2. The company user creates a chatbot and uploads company documents.
3. The product prepares the chatbot for document-grounded conversations.
4. The company user publishes the chatbot and receives a public URL and iframe snippet.
5. A website visitor opens the URL or embedded iframe, asks a question, and receives a response.

## Problem

Companies without AWS expertise cannot independently create and publish a chatbot that answers
questions using their own documents.

## Expected Result

A company can make a public, document-grounded chatbot available to website visitors without
manually configuring AWS.

## Acceptance Criteria

- [ ] A company user can register with Amazon Cognito and access their chatSaaS dashboard.
- [ ] A company user can create a chatbot intended for public website visitors.
- [ ] The chatbot accepts company documents uploaded by the company user as its knowledge source.
- [ ] The chatbot supports document-grounded questions and general conversation.
- [ ] Publishing provides a public URL and an iframe embed option.
- [ ] End to end: a visitor opens the public URL or embedded iframe, asks a document-related
  question, and receives a response.

## Out of Scope

- Authenticated internal chatbots and identity-provider integration.
- Agency multi-client workflows.
- Actions in external systems, webhooks, and integrations.
- JavaScript widgets and advanced visual customization.
- Automated billing and payment collection.
- The purchase and payment workflow for additional credits.
- A final decision on AWS services, tenant isolation, cost attribution, or deployment topology.

## Validation

1. Add automated coverage for the final creation, publishing, and public conversation flow once the
   technology stack is selected.
2. Manually create a chatbot with sample company documents, publish it, open both the URL and iframe,
   and verify a visitor receives a document-grounded answer.
3. Run `npx @kaddo/cli guard` after implementation and review any knowledge drift.

## Definition of Done

- [ ] The problem is clear.
- [ ] The expected result is defined.
- [ ] The impact of not delivering it is stated in the roadmap source.
- [ ] The acceptance criteria are verifiable.
- [ ] Technical decisions needed for implementation are recorded and resolved or explicitly accepted.
- [ ] The Work Item is reviewed by a human before the `ready` transition.

## Open Questions

- [deferred] Which AWS services and provisioning model implement this experience?
- [deferred] Which concrete policies and access controls enforce tenant data isolation, document
  retention, and conversation retention in shared resources?
- [deferred] What numeric limits and enforcement behavior apply to monthly conversations, chatbot
  count, and document-processing volume?
- [deferred] What is the exact prepaid credit price, minimum purchase, expiration, and refund policy?

## Learning

_Update after completion._
