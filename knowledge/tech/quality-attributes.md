---
type: quality-attributes
project_state: ai-assisted
generated_by: bootstrap-agent
template_version: 1
---

# Quality Attributes

## Priorities

1. Simplicity: Companies without cloud expertise must be able to publish a chatbot without AWS
   configuration.
2. Data isolation: Documents and conversations from one company must not be available to another.
3. Usage metering: Product usage must be attributable to a company and enforce its subscription
   limits for monthly conversations, chatbot count, and document-processing volume.
4. Answer traceability: The product should make it possible to evaluate whether a response is
   grounded in supplied documents.
5. Availability: A published public chatbot should remain reachable by website visitors.

## Accepted Trade-offs

- The MVP favors a public URL and iframe over a customizable JavaScript widget.
- The MVP excludes authenticated internal use cases to avoid premature identity and authorization
  complexity.
- The MVP uses shared AWS resources; data isolation is enforced through tenant-aware policies and
  application access controls rather than dedicated infrastructure per company.
- The MVP may begin with usage visibility before automated payment collection, while preserving the
  ability to enforce subscription limits once commercial details are decided.
- A company may opt in to additional credits; without that opt-in, the system must consistently stop
  new conversations after the monthly limit is reached.

## Open Questions

- [deferred] What availability target and support commitment will apply to the MVP?
- [deferred] What document and conversation retention policy will apply?
