---
type: product
project_state: ai-assisted
generated_by: kaddo-bootstrap
template_version: 1
refined_by: bootstrap-agent
---

# Product Context

## Product vision

chatSaaS is a self-service product that lets a company create an AWS-backed AI chatbot using its
own documents. The MVP delivers a public chat page that the company can share or embed with an
iframe.

## User journeys

1. A company user registers with Amazon Cognito and accesses their chatSaaS dashboard.
2. The company user creates a chatbot and uploads company documents.
3. The product prepares the chatbot to answer questions using those documents while supporting
   general conversation.
4. The company user publishes the chatbot and receives a public URL and iframe embed snippet.
5. A website visitor opens the shared or embedded chat and receives answers.

## Scope

In scope for the MVP:
- A company creates its own public chatbot.
- The chatbot answers questions using company documents and supports general conversation.
- The company can share a public URL or embed the chat through an iframe.

Out of scope for the MVP:
- Authenticated internal chatbots and identity-provider integration.
- Agencies managing client organizations.
- External system actions, webhooks, and integrations.
- JavaScript chat widgets.
- Any decision on the exact AWS implementation architecture.

## Success criteria

- A company can make a chatbot available to a website visitor without configuring AWS manually.
- A visitor can access the public chat from its URL or embedded iframe and receive document-grounded
  answers.

## Assumptions

- [assumed] The initial use case is a public customer-facing chatbot rather than an internal
  employee tool.
- [assumed] An iframe is sufficient for the first embed experience.
