# Current State

Generated from Kaddo Context Pack.

## System Overview

chatSaaS is a self-service platform that enables companies to create public AI chatbots grounded in their own documents without requiring AWS expertise. The platform hosts and pays for all AWS infrastructure on behalf of customers, providing a managed service experience.

## Modules

Based on the current knowledge base and user journeys, the system comprises these core modules:

1. **Authentication & User Management** 
   - Amazon Cognito User Pools for company user authentication
   - Self-registration flow with automatic account creation

2. **Chatbot Management**
   - Chatbot creation, configuration, and lifecycle management
   - Document upload and processing interface
   - Publishing controls (public URL generation, iframe embed snippets)

3. **AI Processing Engine**
   - Document ingestion and preprocessing pipeline
   - Vector storage for document embeddings
   - Retrieval-augmented generation (RAG) for question answering
   - Conversation management and context handling

4. **Usage Metering & Billing**
   - Conversation tracking and counting
   - Document processing volume measurement
   - Chatbot count tracking per company
   - Prepaid credit balance management
   - Usage alerts and notifications

5. **Public Chat Interface**
   - Secure public chat endpoints
   - Iframe embeddable chat widget
   - Visitor-facing conversation interface

6. **Admin Dashboard**
   - Company-level administration interface
   - Chatbot creation and management UI
   - Document upload and management
   - Usage analytics and reporting
   - Subscription and billing management

## Dependencies and Integrations

- **Amazon Cognito**: User authentication and authorization (resolved)
- **AWS Services** (to be determined):
  - AI/ML services for document processing and inference
  - Storage services for documents and vectors
  - Database/services for chat state and metadata
  - Compute services for API/backend logic
  - Monitoring and observability services
- **Storage**: Document storage and vector embeddings persistence
- **Observability**: Logging, metrics, and tracing for system monitoring

## Data Stores

Based on the product requirements, these data stores are anticipated:

1. **User & Account Data**: Company and user profiles, authentication data
2. **Chatbot Configuration**: Settings, publishing status, metadata per chatbot
3. **Document Repository**: Storage for uploaded company documents
4. **Vector Store**: Embeddings for document chunks used in retrieval
5. **Conversation History**: Chat logs for context and potential auditing
6. **Usage Metrics**: Counters for conversations, document processing, etc.
7. **Billing & Subscription Data**: Plan details, credit balances, payment information

## Infrastructure

- **Deployment Model**: Shared AWS resources with policy-based tenant isolation (resolved architecture decision)
- **Tenancy Approach**: Multi-tenant shared resources rather than dedicated per-company resources
- **Isolation Mechanism**: Policy-based access control enforcing tenant boundaries
- **Account Structure**: chatSaaS-managed AWS accounts (not customer-owned)
- **Provisioning**: Automated infrastructure provisioning via IaC (inferred)

## Implicit Decisions (candidates)

- [candidate] **Shared Resource Model**: Using shared AWS resources with tenant isolation vs. dedicated resources per customer
  - *Rationale*: Lower operational complexity and cost
  - *Confidence*: High (explicitly resolved in current-state.md)
  
- [candidate] **Tag-based Attribution**: Using AWS resource tags for cost and usage attribution
  - *Rationale*: Enables metering and billing per company/chatbot
  - *Confidence*: Medium (listed as candidate in current-state.md)

- [candidate] **Cognito-only Auth**: Relying solely on Amazon Cognito for authentication
  - *Rationale*: Simplifies auth integration and leverages AWS managed service
  - *Confidence*: High (explicitly resolved in current-state.md)

- [candidate] **Public-facing Architecture**: Designing for public internet access to chatbots
  - *Rationale*: Matches the public chatbot requirement
  - *Confidence*: High (from product scope)

## Open Questions

- [deferred] **Specific AWS Services**: Which services will provide AI inference, document ingestion, retrieval, hosting, and observability?
- [deferred] **Cost Attribution Method**: Which cost reporting method and resource tags will reliably attribute monthly usage to companies and chatbots?
- [deferred] **Usage Limits & Enforcement**: What numeric limits and enforcement behavior apply to monthly conversations, chatbot count, and document-processing volume?
- [deferred] **Credit System Implementation**: What storage and transaction model supports prepaid credit balance, per-conversation deduction, consumption history, and alert delivery?
- [deferred] **Application Structure**: What application and infrastructure structure best supports the public chatbot MVP?
- [deferred] **Data Partitioning Strategy**: How will data be logically partitioned to ensure tenant isolation in shared resources?

## Areas Requiring Human Validation

- **AWS Service Selection**: Validation needed on specific AWS service choices for AI, storage, compute, etc.
- **Pricing Model**: Confirmation of subscription plan limits, pricing, and overage policies
- **Security Requirements**: Validation of data isolation and protection requirements
- **Performance Expectations**: Definition of latency, throughput, and availability requirements
- **Compliance Needs**: Identification of any regulatory or compliance requirements (GDPR, SOC2, etc.)