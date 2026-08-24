# Codebase Structure

## Overview
This is a monorepo built with pnpm workspaces, containing a Next.js web application, AWS Lambda functions, and shared TypeScript packages.

## Directory Structure
- `apps/web`: Next.js 16.3.2 application (React 19.2.8)
- `apps/functions`: AWS Lambda functions (Node.js runtime)
- `packages/core`: Shared core utilities and services
- `packages/types`: Shared TypeScript types and interfaces
- `infra`: Infrastructure-as-code (likely Terraform or AWS CDK)
- `knowledge`: Kaddo knowledge files
- `.kaddo`: Generated Kaddo context and reports

## Technology Stack
### Primary Technologies
- **Node.js**: >=24.0.0 (as per root package.json)
- **TypeScript**: 7.0.2 (used across all packages)
- **Package Manager**: pnpm 11.22.0

### Frontend (apps/web)
- **Framework**: Next.js 16.3.2
- **UI Library**: React 19.2.8 with React DOM
- **Styling**: Tailwind CSS 4.3.3
- **State Management**: Not explicitly defined (likely React Context or external state)
- **Authentication**: AWS Cognito Identity Provider (@aws-sdk/client-cognito-identity-provider)
- **JWT Handling**: jose 5.9.3
- **Validation**: zod 4.4.3
- **Linting**: ESLint 9.15.0 with next-eslint config
- **Type Checking**: tsc --noEmit

### Backend (apps/functions)
- **Runtime**: Node.js (AWS Lambda)
- **Cloud Provider**: AWS SDK v3
  - Bedrock Runtime: @aws-sdk/client-bedrock-runtime
  - S3: @aws-sdk/client-s3
  - DynamoDB: @aws-sdk/client-dynamodb + @aws-sdk/lib-dynamodb
  - S3 Presigner: @aws-sdk/s3-request-presigner
- **AI/ML**: Langchain 1.5.10 with AWS integration (@langchain/aws)
- **Validation**: zod 4.4.3
- **Testing**: Vitest 4.1.11
- **Type Checking**: tsc --noEmit

### Shared Packages
- **packages/core**:
  - Dependencies: AWS SDK clients, @chatsaas/types, zod
  - Purpose: Shared business logic, AWS service wrappers, utilities
- **packages/types**:
  - Dependencies: @types, typescript, zod
  - Purpose: Centralized TypeScript type definitions

## Observed Patterns and Conventions
1. **Monorepo with pnpm workspaces**: All packages and apps are versioned together and share dependencies where possible.
2. **AWS-Centric**: Heavy use of AWS services (Cognito, Bedrock, S3, DynamoDB) for auth, AI, storage, and database.
3. **Type Safety**: TypeScript used throughout with strict type checking (tsc --noEmit scripts).
4. **Validation**: Consistent use of zod for runtime validation across frontend and backend.
5. **Modular Architecture**: Separation of concerns with dedicated packages for core logic and shared types.
6. **Next.js App Router**: The web app uses the standard Next.js structure (pages or app directory not inspected, but typical for v16).
7. **Lambda Functions as Packages**: The functions directory is structured as a deployable package with its own dependencies.
8. **Environment Management**: Example .env files in each app/functions directory for local development.

## Notes
- The root package.json shows an unusual TypeScript version (7.0.2) which may be a typo (likely meant 5.x or 4.x), but we report what is present.
- The `@chatsaas` namespace is used for internal packages, indicating a private npm scope setup.
- The presence of Langchain and AWS Bedrock suggests LLM-powered features in the backend.
- Tailwind CSS v4 indicates recent adoption of the latest Tailwind version.

This description reflects the current state of the codebase as observed from the file structure and package manifests.