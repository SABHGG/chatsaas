# Decision Candidates

Generated from Kaddo Context Pack.

## AWS Service Selection for AI Capabilities

**Context:**
chatSaaS requires AI capabilities for document ingestion, preprocessing, vector storage, retrieval-augmented generation, and conversation management. The platform needs to select specific AWS services that align with the document-grounded AI chatbot requirement while providing scalability, cost-effectiveness, and managed service benefits.

**Possible decision:**
Select a combination of AWS managed services for the AI processing engine, potentially including Amazon Bedrock for foundation models, Amazon Textract for document processing, Amazon OpenSearch Serverless for vector storage, and AWS Lambda for orchestration.

**Alternatives:**
- Amazon SageMaker for custom model training and hosting
- Amazon Kendra for enterprise search capabilities
- Third-party vector databases (Pinecone, Weaviate) via API Gateway
- Aurora PostgreSQL with pgvector extension for vector storage
- Self-managed open-source solutions on EC2/EKS

**Risk:**
Incorrect service selection could lead to increased operational complexity, higher costs, performance bottlenecks, or limitations in AI capabilities that don't meet the document-grounded chatbot requirements.

**Affected areas:**
AI Processing Engine module, Document ingestion pipeline, Vector storage layer, Retrieval system, Conversation management, Infrastructure costs, Development complexity

**Validation needed:**
Technical validation of service capabilities against requirements, cost estimation for expected usage patterns, performance testing with sample documents and queries, evaluation of managed service benefits vs. custom solutions.

---
## Cost Attribution and Billing Mechanism

**Context:**
chatSaaS operates on a shared AWS resource model with policy-based tenant isolation and needs to attribute AWS resource usage to individual companies and chatbots for usage-based billing. The platform requires a reliable method to track and attribute costs for conversations, document processing, and chatbot hosting.

**Possible decision:**
Implement a hybrid approach using AWS Cost Allocation Tags for infrastructure costs combined with application-level metering in DynamoDB for product-specific metrics like conversation counts and document processing volume.

**Alternatives:**
- Pure AWS tagging strategy with detailed resource tagging and Cost Explorer reports
- Pure application-level metering with custom usage aggregation using Athena/S3
- Third-party billing and metering solutions (Stripe, Chargebee) with integrated usage tracking
- AWS Usage Report with custom processing pipelines for attribution

**Risk:**
Inaccurate cost attribution could lead to billing disputes, inability to enforce subscription limits correctly, or unexpected costs that undermine the business model's viability.

**Affected areas:**
Usage Metering & Billing module, Infrastructure tagging strategy, Application metering logic, Billing system integration, Cost reporting dashboard, Financial forecasting

**Validation needed:**
Validation of tagging strategy effectiveness, testing of usage aggregation accuracy, cost modeling for different usage patterns, evaluation of implementation complexity vs. accuracy trade-offs.

---
## Data Partitioning Strategy for Tenant Isolation

**Context:**
chatSaaS requires strong tenant isolation where companies cannot access each other's documents, conversations, or costs. The platform uses shared AWS resources with policy-based isolation but needs a logical data partitioning strategy to ensure this isolation is maintained at the data layer.

**Possible decision:**
Implement a partition key approach using Company ID and/or Chatbot ID as partition keys in all databases and tables, combined with IAM policies that enforce tenant boundaries based on these identifiers.

**Alternatives:**
- Separate tables or schemas per tenant with automated provisioning
- Database-per-tenant approach using Amazon RDS or similar services
- Encryption-at-rest with tenant-specific keys for sensitive data
- Hybrid approach combining logical partitioning with encryption for highly sensitive data

**Risk:**
Inadequate data partitioning could lead to data leakage between tenants, violating security and privacy requirements, potentially resulting in legal and reputational damage.

**Affected areas:**
All data stores (User & Account Data, Chatbot Configuration, Document Repository, Vector Store, Conversation History, Usage Metrics, Billing & Subscription Data), Access control mechanisms, Query performance, Backup and recovery procedures, Compliance reporting

**Validation needed:**
Security testing to verify isolation effectiveness, performance testing with partitioned data, validation of access control policies, evaluation of operational complexity for partition management.

---
## Application Architecture Style

**Context:**
As a new MVP platform, chatSaaS needs to choose an application architecture that balances development speed, operational simplicity, and future scalability. The decision impacts how the system will be developed, deployed, and maintained over time.

**Possible decision:**
Adopt a modular monolith architecture for the MVP, with clear module boundaries corresponding to the core domains (Auth, Chatbot Management, AI Processing, Billing, etc.), deployed as a single deployable unit but designed for eventual decomposition if needed.

**Alternatives:**
- Microservices architecture with independent services for each domain
- Traditional monolithic architecture with all functionality coupled
- Serverless architecture using AWS Lambda functions with managed services
- Event-driven architecture with services communicating via messaging queues

**Impact:**
Affects development speed, team structure, deployment complexity, scaling characteristics, fault isolation, and long-term maintainability.

**Urgency:**
Medium - important for long-term maintainability but MVP can start with a simpler approach that evolves over time.

**Affected areas:**
Codebase structure, Deployment strategy, Inter-service communication, Development workflow, Team organization, Scaling approach, Technology stack choices

**Validation needed:**
Evaluation of team expertise with different architectures, prototyping to assess development velocity, analysis of scaling requirements, consideration of future evolution paths.

---
## Usage Limits and Enforcement

**Context:**
chatSaaS needs to define numeric limits for conversations, chatbots, and document volume per plan, plus enforcement behavior that keeps usage predictable for non-technical customers without surprise charges.

**Possible decision:**
Adopt a hybrid enforcement model: a soft warning at 80% of the monthly limit and a hard block at 100%, with the option to purchase additional credits when credits are enabled. If credits are disabled, block new conversations at the limit without invoking the AI.

**Alternatives:**
- Hard limits: block further usage when the quota is exceeded (no overage path).
- Soft limits: allow overage with additional charges or notifications.
- Rolling window vs. calendar-month reset periods.
- Enforced exclusively via application-level metering in DynamoDB.

**Impact:**
Shapes user experience, revenue model, and billing system complexity.

**Urgency:**
Medium - needed for MVP launch but can iterate post-launch.

**Affected areas:**
Usage Metering & Billing module, Subscription plan enforcement, Conversation management, Credit system.

**Validation needed:**
Enforcement tests at 80%/100%, evaluation of reset-period behavior, verification that blocking never follows an AI invocation.

---
## Credit System Implementation

**Context:**
chatSaaS supports an opt-in prepaid credit system that extends usage beyond subscription plan limits. The billing unit is the completed conversation (not per message), with alerts at 80% and 100% and blocking at zero balance.

**Possible decision:**
Implement a prepaid credit ledger in DynamoDB using atomic counters for credit balances, with a transaction log recording every debit and purchase for auditability.

**Alternatives:**
- RDS (PostgreSQL/MySQL) with a transactional credit ledger.
- Event sourcing pattern with a credit transaction log.
- Third-party billing integration (Stripe, Chargebee) for credit management.

**Impact:**
Affects system reliability, auditability, and billing integration complexity.

**Urgency:**
Medium - needed for monetization but can start with a simpler model.

**Affected areas:**
Usage Metering & Billing module, Credit ledger, Billing system integration, Conversation management.

**Validation needed:**
Atomicity and concurrency tests for balance updates, purchase flow validation, audit trail verification.

---
## Observability and Monitoring Approach

**Context:**
chatSaaS needs comprehensive observability to monitor system health, debug issues, track performance, and ensure service reliability. As a public-facing platform handling customer data and providing AI services, effective monitoring is crucial for both operational excellence and security.

**Possible decision:**
Adopt an AWS-native observability stack using CloudWatch Logs for logging, CloudWatch Metrics for monitoring, and X-Ray for distributed tracing, enhanced with Contributor Insights for anomalous behavior detection.

**Alternatives:**
- Open-source observability stack (Prometheus, Grafana, Loki, Tempo) self-managed or via managed services
- Third-party observability platforms (Datadog, New Relic, Splunk, etc.)
- Hybrid approach combining AWS infrastructure monitoring with application-level logging to external services
- Lightweight approach using basic CloudWatch with application logs stored in S3

**Impact:**
Affects debuggability, performance tuning capacity, operational visibility, alerting effectiveness, and cost of monitoring solution.

**Urgency:**
Low-Medium - basic logging needed early but sophisticated observability can evolve with the system.

**Affected areas:**
All system components, Logging implementation, Metrics collection, Tracing instrumentation, Alerting system, Dashboard development, Incident response procedures

**Validation needed:**
Evaluation of native AWS service capabilities against requirements, cost comparison of different options, assessment of operational overhead for each approach, validation of integration complexity with chosen stack.