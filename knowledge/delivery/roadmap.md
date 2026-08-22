---
type: roadmap
updated_at: 2026-08-22
project_state: ai-assisted
generated_by: roadmap-agent
template_version: 1
refined_by: bootstrap-agent
---

# chatSaaS Roadmap

Initiatives and Work Items below are candidates for human review, not implementation commitments.

## Summary

The first outcome is a public, document-grounded chatbot that a company can share or embed without
manually configuring AWS.

## Assumptions

- [assumed] The initial actor is a company creating a chatbot for its own public website.
- [assumed] An iframe provides sufficient embedding for the MVP.

## Initiatives

### RM-001: Public Document-Grounded Chatbot

**Status:** candidate

**Priority:** high

**Suggested Knowledge Level:** K2

**Related domain:** Public Chatbot Delivery

**Related capabilities:**
- Public chatbot access
- Iframe embedding
- Company document knowledge
- Conversational responses

**Source signals:**
- Business Goal: Let companies publish a document-grounded chatbot without manually configuring AWS.
- Capability Gap: No public chatbot creation and delivery flow exists.

**Problem / opportunity:**

Companies without cloud expertise cannot yet create and publish a chatbot that uses their own
documents.

**Expected value:**

Establish the smallest end-to-end public chatbot experience that validates the product's core value.

**Risks:**

- Exact AWS provisioning, document retrieval, data isolation, and operating model remain undecided.

**Dependencies:**

- A later technical decision on the AWS architecture and account model before implementation.

**Suggested Work Items:**

- WI-CANDIDATE-001: Define the first public chatbot creation and publishing experience.
  - type: feature
  - suggested knowledge level: K2
  - expected value: A company can create a public chatbot backed by its documents and receive a
    shareable URL and iframe embed option.
  - notes: The Work Item must capture the end-to-end outcome and defer AWS implementation choices.

**Not now:**

- Authenticated internal chatbots, agency multi-tenancy, external actions, webhooks, JavaScript
  widgets, and custom visual theming.

## Suggested Execution Order

1. Materialize and refine WI-CANDIDATE-001 as a draft Work Item.
2. Review the draft and resolve its technical dependencies before it is marked ready.

## Risks and Constraints

- AWS account, billing, deployment ownership, document retrieval design, and retention policies are
  deferred technical decisions.

## Not Now

- Internal employee chatbots and authentication.
- Agency workflows and multiple client organizations.
- External actions and integrations.
- Webhooks and JavaScript widgets.

## Next Recommended Work Item

WI-CANDIDATE-001: Define the first public chatbot creation and publishing experience.

## Later

_Ideas and intentions not yet committed._
