---
type: current-state
project_state: ai-assisted
generated_by: kaddo-bootstrap
template_version: 1
refined_by: architecture-agent
---

# Current State

## Initial technical direction

chatSaaS will host and pay for the AWS infrastructure used by customer chatbots. Companies do not
need their own AWS account. Resources must be associated with a company and chatbot so chatSaaS can
measure usage against each company's monthly subscription limits.

The MVP will use shared AWS resources with policy-based tenant isolation. Dedicated per-company
resources are not part of the initial architecture.

## Known constraints

- The MVP must let companies publish a public, document-grounded chatbot without manual AWS setup.
- The system must prevent one company's documents, conversations, and costs from being visible to
  another company.
- Tenant identity must be enforced on every data and service access path within shared resources.
- Provisioning permissions must be limited to the resources needed to operate chatSaaS.

## Unknowns

- [deferred] Which AWS services will provide AI inference, document ingestion, retrieval, hosting,
  and observability?
- [resolved] Company user authentication will use Amazon Cognito User Pools for the MVP. Users 
  self-register and chatSaaS accounts are created automatically without manual intervention.
- [deferred] Which cost reporting method and resource tags reliably attribute monthly usage to a
  company and chatbot?
- [deferred] What numeric limits and enforcement behavior apply to monthly conversations, chatbot
  count, and document-processing volume?
- [deferred] What storage and transaction model supports prepaid credit balance, per-conversation
  deduction, consumption history, and alert delivery?

## Architecture Candidates

- [resolved] Operate customer chatbot infrastructure in chatSaaS-managed AWS accounts with shared
  resources and policy-based tenant isolation.
  - Rationale: This lowers initial and long-term infrastructure cost while keeping customers free of
    AWS account setup.
  - Constraint: Resource access and cost attribution must enforce tenant isolation.
- [candidate] Tag attributable AWS resources with stable company and chatbot identifiers.
  - Rationale: Resource costs and product usage must be attributable to a company and chatbot.
  - Constraint: Shared services require product-level usage metering in addition to resource tags.
