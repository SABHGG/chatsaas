---
type: decision
status: accepted
date: 2026-08-28
supersedes_date: 2026-08-24
---

# ADR-004: AWS Service Selection for AI Capabilities

## Context

chatSaaS requires AI capabilities for document ingestion, preprocessing, vector storage, retrieval-augmented generation, and conversation management. The platform needs to select specific AWS services that align with the document-grounded AI chatbot requirement while providing scalability, cost-effectiveness, and managed service benefits, on top of the multi-tenant shared-resource architecture already decided in DC-001.

The previous version of this ADR (2026-08-24) soft-picked OpenSearch Serverless for vector storage and Textract for document parsing. Both were re-evaluated on 2026-08-28 against three new constraints:

- Q2 (parser) resolved as **in-Lambda** loaders, so paying for a managed OCR service per page is incoherent with a free in-process parser.
- DC-001 product decision is **shared AWS resources with policy-based tenant isolation**, which benefits from SQL-native multi-tenant filtering on the vector store.
- Multi-tenant RAG must filter by `chatbot_id` and `company_id` on every query, which is trivial in SQL and lossy in DynamoDB / requires a separate engine for OpenSearch.

## Decision

Use **Amazon Bedrock** for foundation models, **Aurora Serverless v2 with the pgvector extension** for vector storage, **in-Lambda document parsers** (pdf-parse + mammoth + LangChain loaders) for text extraction, and **AWS Lambda** for orchestration. **Amazon Textract is rejected** for the MVP.

### Components

- **Foundation models**: Amazon Bedrock. Claude 3.5 Sonnet for generation, Amazon Titan Embeddings v2 (`amazon.titan-embed-text-v2:0`, 1024 dims) for embeddings. Titan v2 is preferred over `text-embedding-3-small` (1536 dims) because the lower dimension is comfortable inside the pgvector HNSW index limit (≤2000) and reduces storage by ~33%.
- **Vector store**: **Aurora Serverless v2 cluster** with PostgreSQL 16 and the `pgvector` extension. One cluster, one database, schema-per-tenant is rejected (too many schemas at MVP scale); instead, a single `public` schema with a `chatbot_id` column on the `embeddings` table and a composite HNSW index. Tenant filtering happens in the same SQL query that returns the nearest neighbors.
- **Connection management**: **RDS Proxy** in front of the Aurora cluster. Lambda must NOT open raw connections per invocation. RDS Proxy pools connections and is the only safe path for Lambda → Aurora.
- **Credentials**: Secrets Manager for the database master credential, with 7-day rotation. The cluster is created with `credentials: rds.SecretValue` from CDK.
- **Document parsing**: In-Lambda. `pdf-parse` for PDFs, `mammoth` for DOCX, `@langchain/community/document_loaders/fs/*` and `text` loaders for the rest. Runs inside the existing Node 24 Lambda runtime; no managed OCR service.
- **Orchestration**: AWS Lambda (existing). LangChain 1.5+ with `@langchain/aws` for Bedrock bindings and `@langchain/community` for loaders/splitters.

### Why Aurora Serverless v2 + pgvector

- **Cost**: ~$0/mes parado, ~$50/mes bajo uso. Compare to OpenSearch Serverless ~$700/mes floor before ingesting anything. Compare to Weaviate Dedicated $400/mes floor.
- **Multi-tenant filtering**: SQL-native. The retrieval query is `SELECT id, content FROM embeddings WHERE chatbot_id = $1 AND company_id = $2 ORDER BY embedding <=> $3 LIMIT 10`. Same engine that already hosts ops data if we ever need joins.
- **Bedrock integration**: Amazon Bedrock Knowledge Bases lists Aurora PostgreSQL with pgvector as a supported vector store with a quick-create flow. We do not reinvent ingest.
- **Scale fit**: HNSW index gives recall high enough for MVP and series A. Binary quantization (native to Aurora pgvector) cuts memory ~75% if needed.
- **Operational fit**: Stays in AWS. Adds one RDS, not a third-party vendor.

### Why in-Lambda parsers

- **Cost**: zero per-page cost. No new service.
- **Operational**: no new AWS service. Runs in the existing Lambda runtime.
- **Trade-off accepted**: scanned PDFs come out empty for the MVP. This is a deferred upgrade — the moment a customer needs OCR, a Textract fallback becomes a single-file change in the parser module.

### What is rejected

- **OpenSearch Serverless**: ~$700/mes floor regardless of usage. Operationally complex (different engine from the rest of the stack). No SQL filtering.
- **Amazon Textract**: per-page cost. Overkill for the MVP where most customers upload text-native PDFs.
- **DynamoDB vectors**: marginal cost, no new service, but no SQL filtering and approximate ANN. Multi-tenant filtering would require denormalization and `FilterExpression` on every query, which scans the partition.
- **Pinecone / Weaviate managed**: vendor lock-in, $400/mes piso (Dedicated) or $45/mes piso (Flex) before consumption. Wrong shape of cost for an MVP going to a small number of customers.

## Alternatives Considered

- **Amazon SageMaker** for custom model training and hosting — rejected, Bedrock covers our needs without managing infrastructure.
- **Amazon Kendra** for enterprise search — rejected, opinionated and not aligned with the document-grounded chatbot UX.
- **Third-party vector databases (Pinecone, Weaviate)** via API Gateway — rejected, see cost and lock-in above.
- **OpenSearch Serverless** — rejected, see cost above.
- **DynamoDB with vector attributes** — rejected, no SQL filtering.
- **Self-managed open-source solutions on EC2/EKS** — rejected, serverless is the chosen operational model (ADR-003).

## Justification

This selection provides a balance of managed services that reduce operational complexity while offering the scalability and integration benefits of the AWS ecosystem. **Amazon Bedrock** offers access to foundation models without managing infrastructure, **Aurora Serverless v2 + pgvector** gives us SQL-native multi-tenant vector search at a cost aligned with an MVP, **in-Lambda parsers** keep document processing free, and **Lambda + RDS Proxy** provides a serverless orchestration path that scales to zero.

## Consequences

### Positive

- Cost aligned with MVP economics: no floor cost on the vector store, no per-page cost on the parser.
- Multi-tenant filtering is a SQL JOIN, not a separate architectural concern.
- Single engine for vectors and ops data; if we ever need a relational model for chats/users, we already have the cluster.
- Bedrock + pgvector is a supported Amazon Bedrock Knowledge Bases target, so ingest can lean on KB rather than custom code when we want to.
- Serverless: scales to zero when not in use.

### Negative

- Adds one RDS to operate (Aurora + RDS Proxy). Parameter groups, snapshots, Performance Insights, failover to think about.
- pgvector HNSW index ≤ 2000 dims forces a low-dim embedding model (Titan v2 at 1024). If we ever want 3072-dim embeddings, we paginate or use SVD.
- Lambda + Aurora requires **RDS Proxy or Data API** — raw connections per invocation are a known anti-pattern. The CDK stack must include the proxy from day 1.
- Aurora Serverless v2 has a minimum of 0.5 ACU and a max that we will pin during stack design.
- Region availability: Bedrock is not in every AWS region. The stack must target a region where Bedrock is available (us-east-1, us-west-2 baseline).

## Related Decisions

- ADR-001: Use Amazon Cognito for User Authentication (authentication foundation).
- ADR-003: Technology Stack Selection (serverless + TypeScript full-stack).
- DC-001: Tenant Isolation Model — shared AWS resources with policy-based isolation. Aurora + pgvector enables the SQL-native piece of that decision.

## Validation Needed

- Provision the Aurora Serverless v2 cluster + pgvector extension in a dev AWS account and confirm `CREATE EXTENSION vector;` and HNSW index creation succeed on the chosen engine version.
- Confirm Bedrock model access for Claude 3.5 Sonnet and Titan Embeddings v2 in the target region.
- Benchmark the retrieval query: `SELECT ... ORDER BY embedding <=> $1 LIMIT 10 WHERE chatbot_id = $2` with 10k, 100k, 1M rows.
- Run a stress test through RDS Proxy from concurrent Lambda invocations and confirm no connection storms.
- Validate the in-Lambda parser on the document corpus the first pilot customer will upload (PDF, DOCX, TXT, MD).

## Validation Status

- 2026-08-28: ADR updated to commit Aurora + pgvector + in-Lambda parser. WI-004 (CDK app bootstrap for Aurora) drafted as the first implementation WI of this decision.
