---
type: decision
status: accepted
date: 2026-08-22
---

# ADR-003: Technology Stack Selection

## Context

chatSaaS requires a full-stack TypeScript solution for building a public document-grounded chatbot platform. The system must support:

- Self-service user registration and authentication (Amazon Cognito)
- Document upload and processing
- AI-powered RAG conversations (Amazon Bedrock)
- Public chatbot URLs and iframe embedding
- Subscription-based billing with usage metering
- Multi-tenant isolation on shared AWS resources

## Decision

Use a **TypeScript full-stack** with AWS-native services and serverless architecture.

## Stack Components

### Frontend

**Framework:**
- `next@16.3.2` - React framework with App Router
- `react@19.2.8` - UI library
- `react-dom@19.2.8`

**Authentication:**
- `@aws-sdk/client-cognito-identity-provider@3.1116.0` - Direct Cognito SDK integration
- `jose@5.9.3` - JWT token validation

**UI:**
- `tailwindcss@4.3.3` - Utility-first CSS
- `@radix-ui/react-*@1.x` - Accessible component primitives
- `lucide-react@latest` - Icon library

**State Management:**
- React Server Components for server state
- `zustand@5.x` for client state (if needed)

**Deployment:**
- Vercel (recommended) or CloudFront + S3 via CDK

### Backend

**Runtime:**
- Node.js 24.x on AWS Lambda (latest runtime, matches local development)
- TypeScript compiled to ESM

**API:**
- API Gateway HTTP API (cheaper than REST API)
- Lambda function URLs for simple endpoints

**AWS SDK:**
- `@aws-sdk/client-bedrock-runtime@3.1116.0` - AI inference
- `@aws-sdk/client-s3@3.1116.0` - Document storage
- `@aws-sdk/client-dynamodb@3.1116.0` - Database client
- `@aws-sdk/lib-dynamodb@3.1116.0` - DynamoDB Document Client
- `@aws-sdk/s3-request-presigner@3.1116.0` - Presigned upload URLs

**AI/RAG:**
- `langchain@1.5.10` - LLM orchestration
- `@langchain/aws@1.4.4` - AWS Bedrock integration
- Amazon Bedrock models: Claude 3.5 Sonnet, Titan Embeddings v2

**Vector Store:**
- OpenSearch Serverless or DynamoDB with vector attributes

**Validation:**
- `zod@4.4.3` - Runtime type validation

### Infrastructure

**IaC:**
- `aws-cdk@2.266.0` - CLI
- `aws-cdk-lib@2.266.0` - CDK library
- `constructs@10.x` - CDK constructs

**Storage:**
- DynamoDB - user data, chatbots, conversations, subscription state
- S3 - uploaded documents, processed embeddings
- OpenSearch Serverless - vector search (optional, can start with DynamoDB)

**Authentication:**
- Amazon Cognito User Pools - user registration and sign-in
- Cognito Identity Pools - if frontend needs direct AWS access

### Development Tools

**Testing:**
- `vitest@4.1.11` - Unit and integration tests
- `@playwright/test@1.62.1` - E2E tests
- `@aws-sdk/client-dynamodb-streams@3.1116.0` - Local testing

**Type Safety:**
- `typescript@7.0.2`
- Strict mode enabled

**Linting:**
- `eslint@9.x` with TypeScript parser
- `prettier@3.x`

**Monorepo:**
- pnpm workspaces (see ADR-002)

## Rationale

**TypeScript full-stack:**
- Type safety from database to UI
- Shared types between frontend and backend
- Better DX and fewer runtime errors

**AWS-native services:**
- No vendor lock-in beyond AWS (which is already required)
- Native integration between services
- Serverless architecture = no server management
- Pay-per-use cost model

**Next.js 16:**
- React 19 with Server Components
- Built-in API routes for simple backend logic
- SEO-friendly for landing pages
- Vercel deployment is trivial

**Direct Cognito SDK (no Amplify):**
- Lower cost than Amplify Hosting
- More control over authentication flow
- Simpler architecture without Amplify CLI

**LangChain:**
- Standardized RAG patterns
- Easy model switching
- Built-in document loaders and chunking

**CDK over CloudFormation/Terraform:**
- TypeScript infrastructure = same language as application
- L2 constructs reduce boilerplate
- Built-in AWS best practices

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Next.js 16 + React 19)                       │
│  - Vercel or CloudFront + S3                            │
│  - Cognito auth via @aws-sdk/client-cognito-*           │
└─────────────────┬───────────────────────────────────────┘
                  │
                  │ HTTPS
                  ▼
┌─────────────────────────────────────────────────────────┐
│  API Gateway HTTP API                                   │
│  - JWT validation (Cognito authorizer)                  │
│  - Routes to Lambda functions                           │
└─────────────────┬───────────────────────────────────────┘
                  │
        ┌─────────┴──────────┬──────────────┬─────────────┐
        ▼                    ▼              ▼             ▼
   ┌─────────┐        ┌──────────┐   ┌──────────┐  ┌──────────┐
   │ Lambda  │        │ Lambda   │   │ Lambda   │  │ Lambda   │
   │ (Auth)  │        │(Chatbot) │   │  (Chat)  │  │ (Docs)   │
   └────┬────┘        └─────┬────┘   └────┬─────┘  └────┬─────┘
        │                   │             │             │
        │                   │             │             │
        └───────────────────┴─────────────┴─────────────┘
                            │
            ┌───────────────┼───────────────┬─────────────┐
            ▼               ▼               ▼             ▼
      ┌─────────┐     ┌──────────┐   ┌─────────┐   ┌─────────┐
      │ Cognito │     │ DynamoDB │   │   S3    │   │ Bedrock │
      │  User   │     │          │   │         │   │ Claude  │
      │  Pools  │     │          │   │         │   │ Titan   │
      └─────────┘     └──────────┘   └─────────┘   └─────────┘
```

## Consequences

**Positive:**
- Type-safe end-to-end
- Serverless = auto-scaling, no server management
- AWS-native = best integration and lowest latency
- Modern stack with active community
- Cost-efficient at low and high scale

**Negative:**
- AWS SDK is verbose (mitigated with helper functions)
- Cold starts on Lambda (mitigated with provisioned concurrency if needed)
- CDK has learning curve (offset by TypeScript familiarity)
- Bedrock region availability (check us-east-1 or us-west-2)

**Trade-offs accepted:**
- Amplify rejected for cost reasons
- OpenSearch Serverless deferred until vector scale requires it
- Custom Cognito integration over pre-built UI libraries

## Migration Path

If requirements change:
- Frontend: Next.js is portable to any Node.js host
- Backend: Lambda functions can run in containers (ECS/EKS)
- Database: DynamoDB can export to S3, migrate to PostgreSQL if needed
- AI: LangChain abstracts model provider, can switch from Bedrock

## Implementation Notes

1. Start with Next.js monorepo structure using pnpm workspaces
2. Use CDK to provision Cognito, DynamoDB tables, S3 buckets
3. Implement Cognito auth in Next.js before building chatbot features
4. Begin with DynamoDB for vectors, migrate to OpenSearch only if query performance requires it
5. Use Lambda Powertools for TypeScript for observability

## Version Lock

All versions listed are current as of 2026-08-22. Lock exact versions in package.json to avoid breaking changes.
