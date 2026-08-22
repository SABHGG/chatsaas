---
type: capabilities
project_state: ai-assisted
generated_by: kaddo-bootstrap
template_version: 1
refined_by: bootstrap-agent
---

# Capabilities

## Summary

Planned capabilities for the first public, document-grounded chatbot experience. No production
code exists yet.

## Capability Domains

### Domain: Public Chatbot Delivery

**Purpose:** Let a company publish a chatbot that visitors can use from a web page.

#### Capability: Public chatbot access

- Status: planned
- Capability type: product
- User-facing: yes
- Description: A company can make a chatbot available at a public URL.

#### Capability: Iframe embedding

- Status: planned
- Capability type: product
- User-facing: yes
- Description: A company can embed its public chatbot in an existing website using an iframe.

### Domain: Document-Grounded Conversations

**Purpose:** Enable a chatbot to answer questions from documents supplied by its company.

#### Capability: Company document knowledge

- Status: planned
- Capability type: product
- User-facing: yes
- Description: A company supplies documents that ground chatbot answers.

#### Capability: Conversational responses

- Status: planned
- Capability type: product
- User-facing: yes
- Description: A visitor can ask questions and receive document-grounded or general conversational
  responses.

## Capability Gaps

- [gap] No public chatbot creation and delivery flow exists.
  - Domain: Public Chatbot Delivery
  - Related capability: Public chatbot access
  - Impact: high
  - Possible roadmap candidate: yes

## Roadmap Candidate Signals

- [candidate] Define the public chatbot creation flow and its observable result.
  - Domain: Public Chatbot Delivery
  - Related capability: Public chatbot access
  - Based on: business goal

## Open Questions

- [deferred] How documents are stored, indexed, and retrieved on AWS.
  - note: This is an architecture decision needed before implementation, not before defining the
    first Work Item.
