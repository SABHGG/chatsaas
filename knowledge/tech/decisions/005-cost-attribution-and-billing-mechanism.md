---
type: decision
status: accepted
date: 2026-08-24
---

# ADR-005: Cost Attribution and Billing Mechanism

## Context
chatSaaS operates on a shared AWS resource model with policy-based tenant isolation and needs to attribute AWS resource usage to individual companies and chatbots for usage-based billing. The platform requires a reliable method to track and attribute costs for conversations, document processing, and chatbot hosting.

## Decision
Implement a hybrid approach using AWS Cost Allocation Tags for infrastructure costs combined with application-level metering in DynamoDB for product-specific metrics like conversation counts and document processing volume.

## Alternatives Considered
- Pure AWS tagging strategy with detailed resource tagging and Cost Explorer reports
- Pure application-level metering with custom usage aggregation using Athena/S3
- Third-party billing and metering solutions (Stripe, Chargebee) with integrated usage tracking
- AWS Usage Report with custom processing pipelines for attribution

## Justification
The hybrid approach leverages AWS's native cost allocation capabilities for infrastructure costs while using application-level metering for finer-grained, product-specific metrics that are difficult to capture via tags alone (e.g., per-conversation costs, document processing volume). This provides both accuracy and flexibility.

## Consequences
### Positive
- Accurate cost attribution for both infrastructure and product-specific usage
- Ability to enforce subscription limits and provide usage alerts
- Flexibility to adapt metering logic as product evolves
- Leverages existing AWS infrastructure for cost reporting

### Negative
- Increased complexity in implementing and maintaining two metering systems
- Potential for discrepancies between tag-based and application-level metrics
- Requires careful design to avoid double-counting or missing usage

## Related Decisions
- ADR-004: AWS Service Selection for AI Capabilities (determines which services to tag)
- ADR-006: Data Partitioning Strategy for Tenant Isolation (ensures usage can be attributed correctly)
- ADR-003: Technology Stack Selection (influences choice of database for metering)

## Validation Needed
Validation of tagging strategy effectiveness, testing of usage aggregation accuracy, cost modeling for different usage patterns, evaluation of implementation complexity vs. accuracy trade-offs.