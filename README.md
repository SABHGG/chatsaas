# chatSaaS

Public document-grounded AI chatbot platform for companies without AWS expertise.

## Prerequisites

- Node.js 20.x or later
- pnpm 9.x (install via `corepack enable`)

## Getting Started

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

## Project Structure

```
chatSaaS/
├── apps/
│   ├── web/              # Next.js frontend
│   └── functions/        # Lambda functions
├── packages/
│   ├── core/            # Shared business logic
│   └── types/           # TypeScript types
├── infra/               # AWS CDK infrastructure
└── knowledge/           # Kaddo knowledge base
```

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **Backend**: AWS Lambda, API Gateway, TypeScript
- **Auth**: Amazon Cognito User Pools
- **AI/RAG**: Amazon Bedrock
- **Storage**: DynamoDB, S3
- **Infrastructure**: AWS CDK v2
- **Package Manager**: pnpm

## Documentation

See `knowledge/` directory for:
- Business context and requirements
- Product scope and user journeys
- Technical decisions (ADRs)
- Work Items and roadmap

## Work Item

Currently implementing: **WI-001 - Define public chatbot creation and publishing**

See `knowledge/delivery/work-items/ready/WI-001-define-public-chatbot-creation-and-publishing.md`
