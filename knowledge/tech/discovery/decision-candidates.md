---
type: decision-candidates
project_state: ai-assisted
generated_by: architecture-agent
template_version: 1
---

# Decision Candidates

## DC-001: Tenant Isolation Model

**Status:** resolved

**Context:** chatSaaS hosts AWS infrastructure for multiple companies and must prevent cross-tenant
access to documents, conversations, chatbot configuration, and costs.

**Decision:** Use shared AWS resources with policy-based tenant isolation for the MVP.

**Rationale:** The founder prioritizes lower initial and long-term infrastructure cost. Companies
should not need to operate AWS accounts or dedicated infrastructure.

**Consequences:** Every request, data access, document operation, conversation, and usage record
must carry and enforce the company identity. Dedicated-resource isolation remains a future option
if product, compliance, or scale needs require it.

**Follow-up needed before:** Production implementation must select the concrete AWS services and
prove tenant isolation at each access boundary.

## DC-002: Tenant Usage Metering and Subscription Limits

**Status:** candidate

**Context:** chatSaaS pays AWS and sells a monthly subscription plan with usage limits to each
company.

**Candidate direction:** Tag attributable AWS resources with stable company and chatbot identifiers,
then enforce plan limits from product-level usage metering. Resource-cost attribution remains needed
for margin visibility, particularly where shared-service costs cannot be directly attributed.

**Selected plan metrics:**

- Monthly conversations.
- Number of chatbots.
- Volume of documents processed.

**Deferred details:** Numeric thresholds, how document volume is measured, the limit reset date,
warning behavior, and the response when a company reaches a limit.

**Resolved limit behavior:** Each company can configure whether it permits additional credits. When
additional credits are disabled, new chatbot conversations are blocked after the monthly conversation
limit is reached. When enabled, conversations continue only while the company has additional credit
balance.

**Resolved credit model:**

- Conversation-based billing: charge per resolved conversation (a conversation includes all customer
  questions until closure), not per individual message.
- Prepaid credit purchase: credits are bought in advance through the admin panel.
- Balance display: the admin panel shows remaining credit balance and consumption history.
- Alerts at 80% and 100% of monthly conversation and credit limits, delivered within the panel and
  by email.
- When the conversation limit or credit balance reaches zero, new visitor conversations display a
  clear unavailable message and no AI inference is invoked.

**Deferred credit details:** Exact credit price per conversation, minimum credit purchase amount,
credit expiration policy, and credit refund policy.

**Decision needed before:** Enforcing production subscription limits or accepting customer payments.
