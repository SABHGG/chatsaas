---
type: decision
status: accepted
date: 2026-08-24
---

# ADR-004: AWS Service Selection for AI Capabilities

## Context
chatSaaS requires AI capabilities for document ingestion, preprocessing, vector storage, retrieval-augmented generation, and conversation management. The platform needs to select specific AWS services that align with the document-grounded AI chatbot requirement while providing scalability, cost-effectiveness, and managed service benefits.

## Decision
Select a combination of AWS managed services for the AI processing engine, potentially including Amazon Bedrock for foundation models, Amazon Textract for document processing, Amazon OpenSearch Serverless for vector storage, and AWS Lambda for orchestration.

## Alternatives Considered
- Amazon SageMaker for custom model training and hosting
- Amazon Kendra for enterprise search capabilities
- Third-party vector databases (Pinecone, Weaviate) via API Gateway
- Aurora PostgreSQL with pgvector extension for vector storage
- Self-managed open-source solutions on EC2/EKS

## Justification
This selection provides a balance of managed services that reduce operational complexity while offering the scalability and integration benefits of the AWS ecosystem. Amazon Bedrock offers access to foundation models without managing infrastructure, Textract handles document processing effectively, OpenSearch Serverless provides scalable vector storage, and Lambda enables event-driven orchestration.

## Consequences
### Positive
- Reduced operational overhead through managed services
- Seamless integration with other AWS services (Cognito, Lambda, etc.)
- Scalability to handle variable workloads
- Cost-effectiveness through pay-per-use pricing

### Negative
- Vendor lock-in to specific AWS services
- Potential limitations in customization compared to self-managed solutions
- Learning curve for team members unfamiliar with specific AWS services

## Related Decisions
- ADR-003: Technology Stack Selection (influences orchestration approach)
- ADR-001: Use Amazon Cognito for User Authentication (authentication foundation)

## Validation Needed
Technical validation of service capabilities against requirements, cost estimation for expected usage patterns, performance testing with sample documents and queries, evaluation of managed service benefits vs. custom solutions.