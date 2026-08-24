---
type: decision
status: accepted
date: 2026-08-24
---

# ADR-006: Data Partitioning Strategy for Tenant Isolation

## Context
chatSaaS requires strong tenant isolation where companies cannot access each other's documents, conversations, or costs. The platform uses shared AWS resources with policy-based isolation but needs a logical data partitioning strategy to ensure this isolation is maintained at the data layer.

## Decision
Implement a partition key approach using Company ID and/or Chatbot ID as partition keys in all databases and tables, combined with IAM policies that enforce tenant boundaries based on these identifiers.

## Alternatives Considered
- Separate tables or schemas per tenant with automated provisioning
- Database-per-tenant approach using Amazon RDS or similar services
- Encryption-at-rest with tenant-specific keys for sensitive data
- Hybrid approach combining logical partitioning with encryption for highly sensitive data

## Justification
Using partition keys provides strong logical isolation with minimal operational overhead. It works well with both relational and NoSQL databases, allows efficient querying within a tenant, and simplifies backup/recovery processes. Combined with IAM policies, it ensures that even if a query is misformed, tenants cannot access each other's data.

## Consequences
### Positive
- Strong tenant isolation at the data layer
- Efficient querying and indexing within tenants
- Simplified backup and recovery (can backup/restore per tenant if needed)
- Works with both SQL and NoSQL data stores
- Lower operational complexity compared to database-per-tenant

### Negative
- Requires consistent application of partition keys in all queries
- Potential for hot partitions if one tenant has significantly more data
- Schema migrations must account for partition keys
- Slight storage overhead for storing partition keys

## Related Decisions
- ADR-004: AWS Service Selection for AI Capabilities (determines which data stores are used)
- ADR-005: Cost Attribution and Billing Mechanism (relies on correct tenant attribution)
- ADR-003: Technology Stack Selection (influences choice of databases)

## Validation Needed
Security testing to verify isolation effectiveness, performance testing with partitioned data, validation of access control policies, evaluation of operational complexity for partition management.