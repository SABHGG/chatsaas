---
type: decision
status: accepted
date: 2026-08-22
---

# ADR-001: Use Amazon Cognito for User Authentication

## Context

chatSaaS needs a user authentication system for company users who register, create chatbots, upload documents, and manage their subscription. The product operates entirely on AWS infrastructure (Bedrock, S3, Lambda, DynamoDB).

Two options were considered:
- Auth0: third-party identity provider with polished UI and extensive features
- Amazon Cognito User Pools: AWS-native identity service

## Decision

Use **Amazon Cognito User Pools** for company user authentication.

## Rationale

**Cost efficiency:**
- Cognito: 50,000 monthly active users (MAU) free tier, then ~$0.0055 per MAU
- Auth0: Limited free tier (7,000 MAUs), expensive paid plans

**AWS integration:**
- Native integration with Bedrock, Lambda, API Gateway, S3, and DynamoDB
- Direct IAM role assumption through Cognito Identity Pools
- No external token validation required

**Data sovereignty:**
- User data remains in chatSaaS AWS account
- Full control over identity lifecycle

**Operational simplicity:**
- One less external dependency
- Unified AWS billing and monitoring
- Automatic scaling with AWS infrastructure

## Consequences

**Positive:**
- Lower authentication cost at scale
- Seamless AWS service integration
- Reduced vendor lock-in risk
- Simpler architecture (fewer external services)

**Negative:**
- Hosted UI less polished than Auth0 (can be customized)
- More initial configuration required
- Advanced features (passwordless, social login) require additional setup

## Implementation Notes

- Use Cognito User Pools for user registration and sign-in
- Use Cognito Identity Pools if direct AWS resource access from frontend is needed
- Enable self-service registration with email verification
- Configure password policy and MFA options for security
