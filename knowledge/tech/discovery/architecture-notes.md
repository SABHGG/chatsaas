# Architecture Notes

Discovered during analysis of Kaddo Context Pack for chatSaaS.

## Key Findings

1. **Resolved Architectural Decisions**:
   - chatSaaS operates customer chatbot infrastructure in chatSaaS-managed AWS accounts
   - Uses shared AWS resources with policy-based tenant isolation (not dedicated per-company resources)
   - Company user authentication uses Amazon Cognito User Pools with self-registration
   - MVP focuses on public customer-facing chatbots (not internal employee tools)

2. **Explicit Constraints**:
   - Companies must be able to create chatbots without manual AWS setup
   - Strong tenant isolation required: no visibility between companies' documents, conversations, or costs
   - Tenant identity must be enforced on every data and service access path
   - MVP excludes authenticated internal chatbots, agency multi-client management, webhooks, and JavaScript widgets

3. **Product Scope Implications**:
   - Self-service dashboard for company users
   - Document upload and processing capability
   - Public URL sharing and iframe embed functionality
   - Usage-based subscription model with defined limits

4. **Technical Gaps Identified**:
   - No production code exists yet (repository contains only Kaddo knowledge and guidance)
   - AWS service selection pending for core AI capabilities (inference, document processing, retrieval)
   - Cost attribution mechanism not yet determined
   - Usage limits and enforcement behavior undefined
   - Credit system storage and transaction model unspecified

## Patterns Observed

- Strong emphasis on abstraction: hiding AWS complexity from end users
- Focus on metering and billing: usage tracking is central to the business model
- Clear separation of concerns: admin dashboard vs. public chat interface
- Tenant isolation as a non-negotiable requirement throughout the system

## Risks and Considerations

- Shared resource model requires robust isolation mechanisms to prevent data leakage
- Cost attribution accuracy directly impacts billing reliability
- Public-facing architecture introduces security considerations (DDoS, abuse prevention)
- Document processing pipeline must handle various file types and sizes
- Global availability considerations for public chat endpoints

## Questions for Further Investigation

- What specific AWS managed services align with the document-grounded AI chatbot requirement?
- How will the system handle document processing at scale (various formats, large files)?
- What are the expected traffic patterns for public chat endpoints (bursty vs. steady)?
- How will the system evolve from shared resources to potentially more isolated models as scale increases?