---
type: feature
id: WI-008
title: "Cognito User Pool provisioning via CDK"
knowledge_level: K2
status: completed
phase: now
branch: feature/WI-008-cognito-user-pool
initiative: "RM-001"
created_at: "2026-08-28"
source: post-wi-003-decisions
source_id: post-wi-008-cognito-pool-2026-08-28
source_title: "Cognito User Pool provisioning via CDK"
source_context: "Derived from the post-WI-003 decision set (Q3 Infra-first ordering). WI-003 ships the Cognito JWT verifier (jose 5.10, createRemoteJWKSet against the pool's /.well-known/jwks.json) and WI-004 ships the CDK app skeleton that provisions Aurora + pgvector. Neither WI actually provisions the Cognito User Pool that both depend on. The verifier reads `sub` and `custom:company_id` from a signed JWT whose issuer is `https://cognito-idp.{region}.amazonaws.com/{userPoolId}`. Without this WI, the verifier is wired to an env var that no stack output supplies, and the round-1 companies/users data model has no provisioning path."
source_initiative: "Public Document-Grounded Chatbot"
expected_value: "A CDK construct in `infra/lib/cognito-user-pool.ts` that provisions, in a single stack: (1) one Cognito User Pool for chatSaaS customers, (2) one User Pool Client for the Next.js frontend (apps/web/) with OAuth 2.0 authorization code + PKCE, parameterized callback URLs, (3) one User Pool Domain with a cognito-prefix domain (custom domain deferred), (4) two User Pool Groups (`customer` as default, `admin` for chatSaaS staff) with group assigned on first login from a configurable allowlist, (5) a `custom:company_id` string custom attribute that is required at sign-up, (6) a post-confirmation Lambda that creates the Company record in DynamoDB and adds the new user as its first member, (7) a pre-token-generation Lambda that injects `custom:company_id` and `cognito:groups` into the JWT consumed by the WI-003 verifier, (8) password policy min 12 chars with mixed case + digits + symbols, MFA optional for `customer` and required for `admin`, (9) self-service sign-up enabled, email as username, email verification via Cognito, (10) hosted UI enabled with logo placeholder, (11) CloudFormation stack outputs `UserPoolId`, `UserPoolClientId`, `UserPoolDomain`, and `IssuerUrl`, (12) vitest tests using `aws-cdk-lib/assertions` covering all of the above."
risks:
  - "Pre-token-generation Lambda failure silently breaks all auth: if the Lambda throws, Cognito returns no token to the user and the frontend sees a generic error. Without an explicit DLQ + alarm + alert route, an outage in this Lambda takes the whole product offline. Mitigation: wire the Lambda to a CloudWatch alarm on Errors >= 1 in 5 min, route alarms to an SNS topic, and have the construct fail synth if the alarm is not connected to a topic (optional but recommended)."
  - "Post-confirmation Lambda race with first login: the pre-token-generation Lambda runs before the post-confirmation Lambda has written the Company record. Mitigation: the pre-token-generation Lambda must read `custom:company_id` directly from the Cognito user attributes (not from DynamoDB), so the post-confirmation Lambda is not on the critical path of the first token issuance. The post-confirmation Lambda only needs to land before the user's first authenticated API call that hits the `companies` table."
  - "Group assignment without company allowlist: if the admin allowlist is empty or misconfigured, a user self-registering could be silently put into `admin` (or, worse, the group assignment path could fail open and drop the user with no group). Mitigation: the construct takes `adminAllowlist` as a required context value (not a secret); group assignment defaults to `customer` if the user is not on the allowlist; a CloudFormation rule or unit test asserts the default path."
  - "Hosted UI rate limits on sign-up: Cognito throttles self-service sign-up at the User Pool level. A mass-registration attempt can block legitimate sign-ups. Mitigation: enable Cognito's Advanced Security Features (adaptive authentication) in audit mode for dev, optional enforcement mode for prod; surface the configurable flag in the construct. Adaptive auth is on the Cognito bill."
  - "Custom attribute immutability mistake: `custom:company_id` is set once at sign-up and must be immutable thereafter. If the construct (or a future operator) sets `mutable: true` and the Lambda or a user self-edit changes it, the JWT's tenant claim no longer matches the DynamoDB Company record and the user is locked out of their own data. Mitigation: the construct hardcodes `mutable: false` for `custom:company_id`; a unit test asserts the property; a follow-up WI adds an IAM policy that denies `cognito-idp:AdminUpdateUserAttributes` on this attribute for non-admin principals."
  - "Lambdas written in this WI will be the first non-CDK Lambda code in the repo. Bundle/version drift between the CDK-bundled Lambdas and the future `apps/functions` Lambdas is a risk. Mitigation: pin `@aws-sdk/*` and `jose` versions in the Lambda bundle to match ADR-003 (jose 5.9.3, @aws-sdk/client-cognito-identity-provider 3.1116.0); document the boundary in the construct README."
  - "Region lock: the User Pool's issuer URL is region-specific and is the verifier's `iss` claim. If WI-004 is synthesized for us-east-1 and this WI is synthesized for eu-west-1, the verifier (WI-003) will reject every token. Mitigation: this WI reads the same `region` context as WI-004 and emits it as a stack output; the WI-003 env wiring is updated in a follow-up to source region from the same CDK context."
  - "Custom domain deferred: the proposal uses a Cognito prefix domain (`https://chatSaas-dev.auth.{region}.amazoncognito.com`). This URL will change if the User Pool is deleted and recreated. For prod a custom domain (`auth.chatsaas.com`) is needed; out of scope here."
dependencies:
  - "WI-002 (completed) — defines the 7 handler factories and the OpenAPI security scheme (`Bearer JWT`, `sub` and `custom:company_id` claims) that this WI must satisfy."
  - "WI-003 (completed) — the Cognito JWT verifier (jose 5.10, `createRemoteJWKSet`) that consumes the User Pool's JWKS. This WI provides the User Pool whose `/.well-known/jwks.json` the verifier reads."
  - "WI-004 (ready) — the sister CDK stack this WI joins. Both stacks are synthesized from the same `infra/` CDK app. This WI either (a) adds resources to `ChatSaaSStack` defined in WI-004, or (b) defines `ChatSaaSIdentityStack` and is wired to the API stack via a follow-up; the open question below pins the choice."
  - "ADR-001 (Use Amazon Cognito for User Authentication) — already accepted. Panel-managed accounts, no Auth0, no Amplify."
  - "ADR-003 (Technology Stack Selection) — pins `@aws-sdk/client-cognito-identity-provider@3.1116.0` and `jose@5.9.3`; this WI reuses those versions inside the bundled Lambdas."
  - "ADR-006 (Data Partitioning Strategy for Tenant Isolation) — companies are the tenant boundary; `custom:company_id` is the JWT claim that carries that boundary into the API layer."
  - "`apps/functions/src/db/schema.ts` — the schema registry this WI must extend. NOTE: as of WI-008 drafting, the schema does NOT yet define a `companies` table or a `Company` type. The post-confirmation Lambda's data write requires that schema to be added (this WI adds it, or a tiny follow-up does). See open questions."
code:
  - "infra/lib/cognito-user-pool.ts"
  - "infra/lib/lambda/post-confirmation.ts"
  - "infra/lib/lambda/pre-token-generation.ts"
  - "infra/lib/lambda/companies-table.ts"
  - "infra/lib/cognito-policies.ts"
  - "infra/test/cognito-user-pool.test.ts"
  - "infra/test/lambda-handlers.test.ts"
related_capabilities:
  - "Company user authentication"
  - "Multi-tenant isolation (JWT claim carries company_id)"
  - "Self-service sign-up for company users"
  - "chatSaaS staff admin separation (cognito:groups)"
  - "Hosted UI sign-in / sign-up for apps/web/"
scope_confidence:
  level: high
  reasons:
    - "ADR-001 commits Cognito. The verifier contract (sub + custom:company_id) is fixed by WI-003. The companies-as-tenant model is fixed by ADR-006. Only the construct shape and the post-confirmation data write are open."
    - "Two open decisions: (1) post-confirmation vs pre-token-generation for the Company-record write, and (2) where the companies table lives (DynamoDB extension of apps/functions/src/db/schema.ts vs a new infra-managed table). Both are listed in decision candidates and open questions."
  open:
    - "Choice of DynamoDB table for companies: extend apps/functions/src/db/schema.ts or add a new infra-managed table in the CDK stack. See open question 1."
    - "Admin allowlist mechanism: SSM parameter, Secrets Manager JSON, or a hardcoded CDK context list. See open question 2."
impact_analysis:
  surfaces:
    frontend:
      status: affected
      reason: "apps/web/ will use the UserPoolClientId + UserPoolDomain + callback URLs as env vars to start the hosted-UI OAuth code+PKCE flow. This WI emits the values; the frontend wiring is a follow-up WI."
    backend:
      status: affected
      reason: "apps/functions JWT verifier (WI-003) reads COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, COGNITO_REGION. This WI emits them as CloudFormation outputs. The env wiring in the API stack is a follow-up."
    database:
      status: affected
      reason: "The post-confirmation Lambda writes to a `companies` table. The schema for that table does not yet exist in apps/functions/src/db/schema.ts; this WI adds it (or notes that a follow-up does)."
    configuration:
      status: affected
      reason: "New CDK context values: cognitoDomainPrefix, callbackUrls (dev/prod), adminAllowlist, mfaMode (optional/required), advancedSecurityMode (off/audit/enforced)."
    authentication:
      status: affected
      reason: "This WI provisions the User Pool that ADR-001 commits to and that the WI-003 verifier reads from."
    notifications: not-applicable
    analytics: not-applicable
    documentation:
      status: affected
      reason: "infra/lib/cognito-user-pool.ts ships a short README section documenting the contract (env vars, callback URLs, group semantics)."
    operations:
      status: affected
      reason: "CloudWatch alarms on the two Lambda functions; Cognito Advanced Security Mode configurable; password policy enforced at the pool level."
module_coverage:
  agents:
    status: reviewed-not-affected
  backend:
    status: affected
  api:
    status: affected
  infra:
    status: affected
decision_candidates:
  - id: DC-008-1
    title: "Which Lambda creates the Company record on first sign-up?"
    question: "Should the DynamoDB write to the companies table run in the post-confirmation trigger (after email verification) or in the pre-token-generation trigger (before the first token is issued)?"
    options:
      - id: DC-008-1-a
        title: "Post-confirmation Lambda"
        summary: "Cognito post-confirmation trigger fires once per user, after the email/SMS code is verified. Lambda parses the event, generates a Company ID (UUID v4), writes a Company record, and updates the user's `custom:company_id` attribute via AdminUpdateUserAttributes."
        pros:
          - "Cognito-native: one event per new user, idempotent if guarded by a `userPoolId+sub` conditional write."
          - "Fires before any user-initiated API call, so the company record exists by the time the user hits the dashboard."
          - "Aligns with the WI-002 'companies exist before first interaction' invariant."
        cons:
          - "Adds latency to the post-confirmation flow. Mitigation: Lambda is small and DynamoDB PutItem is sub-10ms."
          - "If the Lambda fails, Cognito marks the user as confirmed but no Company exists. Mitigation: write the company FIRST then mark the user confirmed (Cognito invokes the trigger only on success; if Lambda throws, the confirmation is rolled back by Cognito's behavior of not committing the confirmation)."
        chosen: true
        rationale: "Post-confirmation is the Cognito-native lifecycle hook for 'user is now real, give them a tenant'. The pre-token-generation hook stays focused on JWT claim injection (its only job)."
      - id: DC-008-1-b
        title: "Pre-token-generation Lambda"
        summary: "Do the DynamoDB write in the pre-token-generation Lambda instead."
        pros:
          - "Single Lambda for all per-user work."
        cons:
          - "Pre-token-generation fires on EVERY token issuance, not just the first. Idempotency is harder to reason about."
          - "If the Lambda is slow, every token issuance is slow."
          - "Mixes two concerns (tenant provisioning, claim injection) in one function."
        chosen: false
    chosen: DC-008-1-a
  - id: DC-008-2
    title: "Pre-token-generation Lambda claim source"
    question: "Where does the pre-token-generation Lambda read `custom:company_id` from?"
    options:
      - id: DC-008-2-a
        title: "Read from user attributes"
        summary: "Read `custom:company_id` directly from the userAttributes map in the Cognito trigger event."
        pros:
          - "O(1), no DynamoDB call, no race with the post-confirmation write."
          - "Single source of truth: Cognito user attributes."
        cons:
          - "Requires the attribute to be set before token issuance. Mitigation: post-confirmation Lambda sets it as part of the same flow."
        chosen: true
      - id: DC-008-2-b
        title: "Read from DynamoDB"
        summary: "Read from the companies table by userId."
        pros:
          - "Defensive: works even if Cognito attributes drift."
        cons:
          - "Extra network call on every token issuance."
          - "Adds a hard dependency between token issuance and DynamoDB availability."
        chosen: false
    chosen: DC-008-2-a
---

# WI-008: Cognito User Pool provisioning via CDK

## Goal

Provision the Amazon Cognito User Pool that ADR-001 commits to and that the WI-003 JWT verifier reads from, entirely through CDK, and emit its identifiers as CloudFormation stack outputs. The pool supports self-service sign-up for company users, a hosted-UI OAuth 2.0 authorization-code + PKCE flow for the Next.js frontend, a `custom:company_id` immutable claim that the API layer uses for tenant isolation, a `cognito:groups` claim that separates customer users from chatSaaS staff, and a post-confirmation Lambda that creates the Company record in DynamoDB on first sign-up.

## Scope

In scope:

- New CDK construct at `infra/lib/cognito-user-pool.ts` exporting `CognitoUserPoolConstruct` (props: `cognitoDomainPrefix: string`, `callbackUrls: { dev: string[]; prod: string[] }`, `signOutUrls: { dev: string[]; prod: string[] }`, `adminAllowlist: string[]`, `mfaMode: 'optional' | 'required'`, `advancedSecurityMode: 'off' | 'audit' | 'enforced'`, `region: string`, `envName: 'dev' | 'prod'`).
- One Cognito User Pool:
  - `userPoolName`: `chatsaas-{envName}-users`.
  - `selfSignUpEnabled: true`.
  - `signInAliases: { email: true }` (email is the username).
  - `autoVerify: { email: true }`.
  - `standardAttributes: { email: { required: true, mutable: true } }`.
  - `customAttributes: { company_id: { type: 'String', mutable: false } }`. Immutable.
  - `passwordPolicy: { minLength: 12, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: true, tempPasswordValidity: Duration.days(3) }`.
  - `mfa: mfaMode === 'required' ? 'ON' : 'OFF'` for the pool; the `admin` group adds an explicit `AdminAddUserToGroup` + `UserPoolClient` policy of TOTP required (see group section).
  - `accountRecovery: 'EMAIL_ONLY'`.
  - `deletionProtection: envName === 'prod' ? 'RETAIN' : 'DESTROY'`.
  - `advancedSecurityMode: advancedSecurityMode` (default `audit` for dev, `enforced` for prod).
  - `lambdaTriggers: { postConfirmation, preTokenGeneration }`.
- One User Pool Client for the Next.js frontend:
  - `generateSecret: false` (PKCE does not use a client secret; public client).
  - `authFlows: { userSrp: true, userPassword: false, custom: false }` (hosted UI does SRP; we do not allow USER_PASSWORD auth).
  - `oAuth: { flows: { authorizationCodeGrant: true, implicitCodeGrant: false, clientCredentials: false }, scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE, OAuthScope.COGNITO_GROUPS], callbackUrls: callbackUrls[envName], logoutUrls: signOutUrls[envName] }`.
  - `preventUserExistenceErrors: 'ENABLED'`.
  - `enableTokenRevocation: true`.
  - `accessTokenValidity: Duration.hours(1)`, `idTokenValidity: Duration.hours(1)`, `refreshTokenValidity: Duration.days(30)`.
  - `readAttributes` and `writeAttributes` whitelists that include `email`, `email_verified`, and `custom:company_id` (write restricted to admins).
- One User Pool Domain:
  - `userPoolDomain: UserPoolDomain.fromCognitoDomain(this, 'Domain', cognitoDomainPrefix)` (custom domain deferred).
- Two User Pool Groups:
  - `customer` (precedence 0, description "Company user; default for self-signup"). All sign-ups land here unless on the allowlist.
  - `admin` (precedence 10, description "chatSaaS staff; MFA TOTP required, no per-tenant chatbot access"). The construct does NOT enforce MFA on the group directly (Cognito groups do not own MFA), but it does attach a `preTokenGeneration` check that throws if an `admin` user has no `software_token_mfa` setting; this is layered on top of the pool-level MFA flag.
- Group assignment on first login:
  - The pre-token-generation Lambda reads `event.request.groupConfiguration.groupsToOverride` if set, else computes from the `cognito:groups` already in the user's group list. The allowlist is implemented as a list of email addresses passed in via CDK context; on each invocation the Lambda checks `event.userName` (the user's `sub`) and the user's email (from `userAttributes.email`) against the allowlist, and assigns `admin` if matched, `customer` otherwise.
  - For the FIRST login (no group yet), the Lambda uses `AdminAddUserToGroup` (via `@aws-sdk/client-cognito-identity-provider`) to persist the assignment.
- `custom:company_id` required at sign-up:
  - The sign-up API rejects attempts that omit `custom:company_id`. Implementation: `schemas` on the User Pool Client includes `custom:company_id` as a required attribute. The Next.js sign-up UI (apps/web/) must collect company name + an optional company_id (default: auto-generated server-side).
  - A pre-sign-up Lambda is NOT in scope. The required attribute is enforced at the hosted-UI form level (Cognito rejects the sign-up submission if a required custom attribute is missing). The post-confirmation Lambda handles the case where company_id is supplied at sign-up but the Company record is not yet created.
- Post-confirmation Lambda (`infra/lib/lambda/post-confirmation.ts`):
  - Trigger source: `PostConfirmation_ConfirmSignUp` (Cognito event `source = 'PostConfirmation_ConfirmSignUp'`).
  - Action: generate a Company ID (UUID v4), write a Company record to DynamoDB with `{ id: companyId, ownerUserId: sub, name: <from custom attribute or 'My Company'>, createdAt: ISO8601 }`, and `AdminUpdateUserAttributes` to set `custom:company_id = companyId` on the user.
  - Permissions: IAM policy granting `dynamodb:PutItem` on `arn:aws:dynamodb:{region}:{account}:table/companies` and `cognito-idp:AdminUpdateUserAttributes` on the user pool.
  - Idempotency: conditional write with `ConditionExpression: 'attribute_not_exists(id)'`.
  - Trigger sources justification (1–2 lines, satisfies the "justify which Lambda" requirement): the post-confirmation hook is the Cognito-native lifecycle event for "user is now real, give them a tenant". It runs once per user (after email verification, before the first token issuance completes) and is idempotent under the conditional write, so the risk of duplicate Company rows is bounded. The pre-token-generation hook is reserved for the read-only task of injecting claims into the JWT — separating the two concerns keeps each Lambda under 100 lines and individually testable.
- Pre-token-generation Lambda (`infra/lib/lambda/pre-token-generation.ts`):
  - Trigger source: `TokenGeneration_HostedAuth` (and `TokenGeneration_Authentication` for completeness).
  - Action: read `event.request.userAttributes.custom:company_id` and the user's `cognito:groups`; copy both into `event.response.claimsOverride.details`. Do NOT call DynamoDB.
  - For `admin` users, if MFA is not configured (`event.request.userAttributes['cognito:user_status']` or absence of TOTP), throw an exception so Cognito refuses to issue the token.
  - Permissions: NONE (read-only trigger, no AWS API calls). This is the rationale for the risk "Lambda failure breaks all auth" — it is a pure function.
- Hosted UI:
  - `cognitoDomainPrefix` is parameterized.
  - Logo and CSS customization is OUT of this WI (placeholder; follow-up WI-009).
- Stack outputs:
  - `UserPoolId` (`CfnOutput`).
  - `UserPoolClientId`.
  - `UserPoolDomain` (the full URL: `https://{prefix}.auth.{region}.amazoncognito.com`).
  - `IssuerUrl` (`https://cognito-idp.{region}.amazonaws.com/{userPoolId}`). This is the `iss` claim the WI-003 verifier checks.
- Companies table:
  - This WI adds a `companies` table to `apps/functions/src/db/schema.ts` (if not already present). Type:
    ```ts
    export type Company = {
      id: string;            // UUID v4, also the partition key
      ownerUserId: string;   // sub of the first user
      name: string;
      createdAt: string;     // ISO 8601
      updatedAt: string;
    };
    ```
  - Table name: `chatsaas-{envName}-companies`. The CDK construct creates the DynamoDB table (PAY_PER_REQUEST, point-in-time recovery on for prod, off for dev). The post-confirmation Lambda writes to it.
  - Rationale for owning the table here (not in apps/functions): the table is part of the identity stack lifecycle. apps/functions consumes it via the existing `TABLES` constant in `db/schema.ts`.
- Vitest tests (`infra/test/cognito-user-pool.test.ts` and `infra/test/lambda-handlers.test.ts`):
  - `aws-cdk-lib/assertions.Template.fromStack(stack)` snapshot.
  - Asserts: 1 UserPool, 2 UserPoolGroups (customer + admin), 1 UserPoolClient, 1 UserPoolDomain, 1 PostConfirmation Lambda, 1 PreTokenGeneration Lambda, 1 DynamoDB table for companies, CloudWatch alarms for both Lambdas (Errors >= 1 in 5 min), 4 CfnOutputs.
  - Property assertions: password policy has minLength 12 and all four character classes required; `custom:company_id` is `mutable: false`; OAuth flow is `authorizationCodeGrant` only; callback URLs match `envName`; group precedence customer(0) < admin(10); deletion protection is `RETAIN` for prod; ID token validity 1h, refresh 30d; advanced security mode default is `audit` for dev.
  - Lambda handler unit tests: post-confirmation generates a UUID, calls PutItem with the right shape, and calls AdminUpdateUserAttributes; pre-token-generation copies `custom:company_id` and `cognito:groups` into `claimsOverride.details`; pre-token-generation throws for admin users without TOTP.

Out of scope:

- Custom Cognito domain (`auth.chatsaas.com`). This WI uses a Cognito-issued prefix domain. A follow-up WI (suggested id WI-009) provisions ACM + CloudFront + UserPoolDomain with custom domain.
- Social identity providers (Google, Apple, Facebook, SAML/OIDC). The pool supports federated IdP; this WI does not wire any. A follow-up WI adds per-IdP.
- MFA enforcement for ALL users. This WI makes MFA `optional` for `customer` users and `required` (via the pre-token-generation guard) for `admin`. A follow-up WI can flip the pool to `ON` and remove the per-group guard.
- Logo and CSS customization of the hosted UI. The default Cognito logo is used; the chatSaaS logo upload is a follow-up WI.
- The Next.js frontend wiring (apps/web/) that starts the OAuth code + PKCE flow against `UserPoolDomain`. This WI emits the values; the wiring is a follow-up WI.
- The API stack env-var wiring (consuming UserPoolId/ClientId/Region in the Fastify server). This WI emits the values; a follow-up WI plumbs them into the API stack outputs.
- Local dev: a working sign-up flow without a real AWS account. Local dev uses `AUTH_DISABLED=true` per the WI-003 convention; the Cognito pool is exercised in the deployed dev stack only.
- Account linking, remember-device policy, threat protection, bot detection beyond Advanced Security audit mode.
- Per-attribute IAM policies on the User Pool. A follow-up WI adds `cognito-idp:AdminUpdateUserAttributes` denial policies for non-admin principals on `custom:company_id`.

## Acceptance Criteria

1. `pnpm -F infra synth` produces a CloudFormation template that includes exactly one `AWS::Cognito::UserPool`, one `AWS::Cognito::UserPoolClient`, one `AWS::Cognito::UserPoolDomain`, two `AWS::Cognito::UserPoolGroup` resources (`customer`, `admin`), one `AWS::DynamoDB::Table` named `chatsaas-{envName}-companies`, and four `AWS::CloudFormation::Output` values (`UserPoolId`, `UserPoolClientId`, `UserPoolDomain`, `IssuerUrl`).
2. The User Pool's `PasswordPolicy` has `MinimumLength: 12`, `RequireLowercase: true`, `RequireUppercase: true`, `RequireNumbers: true`, `RequireSymbols: true`, and `TemporaryPasswordValidityDays: 3`.
3. The User Pool has exactly one custom attribute, `custom:company_id`, with `Mutable: false` and `StringAttributeConstraints.MinLength: "1"`. A unit test asserts `mutable: false`. **AC-13 (chain-of-custody, closed via DC-005-1)**: the User Pool Client's `writeAttributes` whitelist omits `custom:company_id` (so the SignUp flow cannot accept it from the client). A vitest asserts the read/write attribute sets. **AC-14 (chain-of-custody, IAM scoping)**: the only IAM principal in the synthesized template with `cognito-idp:AdminUpdateUserAttributes` is the post-confirmation Lambda's execution role. A CDK assertion iterates every role / instance profile / user in the template and fails the build if any other principal has that action. Together AC-13 + AC-14 close the DC-005-1 chain of custody: `custom:company_id` is server-controlled by construction, and the `auth/claims.ts` SECURITY NOTE is updated during implementation to describe it.
4. The User Pool Client has `GenerateSecret: false`, `AllowedOAuthFlows: ['code']`, `AllowedOAuthScopes` includes `openid`, `email`, `profile`, `aws.cognito.signin.user.admin` (for `cognito:groups`), `CallbackURLs` matches the envName-specific list (dev includes `http://localhost:3000/callback`; prod includes `https://app.chatsaas.com/callback`), `ExplicitAuthFlows` does NOT include `ALLOW_USER_PASSWORD_AUTH` or `ALLOW_CUSTOM_AUTH`, and `IDTokenValidity: 1`, `RefreshTokenValidity: 30` (in hours/days respectively per the CDK Duration).
5. The User Pool Domain is created with `DomainPrefix` set to the `cognitoDomainPrefix` construct prop and no custom domain config. The full URL `https://{prefix}.auth.{region}.amazoncognito.com` is emitted as a stack output.
6. The post-confirmation Lambda has `Handler: index.handler`, runtime `nodejs20.x`, environment vars `COMPANIES_TABLE_NAME` and `COGNITO_USER_POOL_ID` (referenced from the stack), and an IAM policy granting `dynamodb:PutItem` on the companies table and `cognito-idp:AdminUpdateUserAttributes` on the user pool. A unit test asserts both.
7. The pre-token-generation Lambda has `Handler: index.handler`, runtime `nodejs20.x`, and NO IAM permissions (no AWS API calls). A unit test asserts the IAM statement count is zero and the handler is pure (same input -> same output).
8. The pre-token-generation Lambda copies `custom:company_id` and `cognito:groups` from `event.request.userAttributes` / the user's group list into `event.response.claimsOverride.details`. A unit test asserts the exact output shape.
9. For the `admin` group, if the user's attributes do not include a TOTP MFA setting, the pre-token-generation Lambda throws and Cognito returns no token. A unit test asserts the throw.
10. The companies table is `PAY_PER_REQUEST`, has `PointInTimeRecoverySpecification` enabled when `envName === 'prod'`, and is referenced by the post-confirmation Lambda's IAM policy. A unit test asserts the table name matches the envName-specific pattern.
11. `pnpm -F infra test` runs all vitest cases green: the cdk assertions suite (12+ assertions) and the lambda handler unit tests (5+ tests). No `cdk synth` warnings about unresolved tokens, missing context, or deprecated props.
12. `apps/functions/src/db/schema.ts` includes a `Company` type and a `TABLES.COMPANIES` constant matching the table name `chatsaas-{envName}-companies`. The handler factories in `apps/functions` (WI-002) are not modified; only the schema registry grows.

## Tasks

Format follows the tasks/WI-004 YAML in `knowledge/delivery/work-items/ready/`. Each task has `id`, `title`, `dependencies`, `estimate` (S/M/L), and `description`.

```yaml
- id: T-008-01
  title: "Extend apps/functions/src/db/schema.ts with Company type and TABLES.COMPANIES"
  dependencies: []
  estimate: S
  description: |
    Add to apps/functions/src/db/schema.ts:
      - `Company` type (id, ownerUserId, name, createdAt, updatedAt).
      - `TABLES.COMPANIES = 'chatsaas-dev-companies'` (placeholder; final value driven by CDK envName).
    Update the OpenAPI schema in openspec/WI-002-backend-endpoints-openapi.yaml to
    declare a `Company` resource and reference `custom:company_id` as the JWT claim
    that scopes tenant queries.
  acceptance: schema.ts compiles, TABLES.COMPANIES exported, OpenAPI lints.

- id: T-008-02
  title: "Add CDK deps and tsconfig for the new construct"
  dependencies: []
  estimate: S
  description: |
    Add to infra/package.json:
      - aws-cdk-lib (already present from WI-004)
      - constructs (already present)
      - @aws-sdk/client-cognito-identity-provider@3.1116.0
      - jose@5.9.3
      - uuid@9.x and @types/uuid
    Confirm aws-cdk-lib version is 2.266.0 (ADR-003). Update infra/tsconfig.json
    to include infra/lib/lambda/**/* in the compile glob.
  acceptance: pnpm install at repo root resolves; infra tsc --noEmit clean.

- id: T-008-03
  title: "Implement post-confirmation Lambda handler"
  dependencies: [T-008-01, T-008-02]
  estimate: M
  description: |
    Write infra/lib/lambda/post-confirmation.ts:
      - Trigger source: PostConfirmation_ConfirmSignUp.
      - Generate UUID v4 for the new Company.
      - DynamoDB PutItem to TABLES.COMPANIES with ConditionExpression
        `attribute_not_exists(id)`.
      - cognito-idp AdminUpdateUserAttributes setting
        `custom:company_id = companyId` on the user (UserAttributes update).
      - Return event unchanged.
    Pin jose 5.9.3 and @aws-sdk/client-cognito-identity-provider 3.1116.0 in the
    inline bundle (no package.json for the Lambda; use esbuild bundling).
  acceptance: handler is idempotent under duplicate invocations; unit test covers
    the happy path and the conditional-write failure case.

- id: T-008-04
  title: "Implement pre-token-generation Lambda handler"
  dependencies: [T-008-02]
  estimate: M
  description: |
    Write infra/lib/lambda/pre-token-generation.ts:
      - Trigger sources: TokenGeneration_HostedAuth, TokenGeneration_Authentication.
      - Read event.request.userAttributes['custom:company_id'] and the user's
        cognito:groups; copy both into event.response.claimsOverride.details.
      - If the user is in the `admin` group and has no
        `cognito:user_status` MFA setting (TOTP), throw `MFA required for admin`.
      - No AWS API calls; no DynamoDB; no Cognito SDK.
    This is a pure function over the event payload. Bundle size target: < 30 KB.
  acceptance: unit test asserts the output shape for customer and admin users;
    admin-without-MFA throws.

- id: T-008-05
  title: "Implement CognitoUserPoolConstruct with UserPool, Client, Domain, Groups"
  dependencies: [T-008-03, T-008-04]
  estimate: L
  description: |
    Write infra/lib/cognito-user-pool.ts exporting `CognitoUserPoolConstruct`
    with the props listed in Scope. Wire:
      - UserPool (password policy, custom attributes, lambda triggers,
        advanced security mode, deletion protection, MFA).
      - UserPoolClient (OAuth code+PKCE, callback URLs by envName, no secret,
        ID/refresh token validity).
      - UserPoolDomain (cognito prefix, no custom domain).
      - UserPoolGroup `customer` (precedence 0) and `admin` (precedence 10).
      - The two Lambda functions as edge of the construct, bundled with esbuild
        (Node 20, single-file output).
      - CloudWatch alarms on both Lambdas: Errors >= 1 over 5 min, no action
        (SNS topic wiring is a follow-up; alarm resource exists for the test).
      - CfnOutputs: UserPoolId, UserPoolClientId, UserPoolDomain, IssuerUrl.
  acceptance: construct compiles; a Stack containing only this construct
    passes the assertions in T-008-08.

- id: T-008-06
  title: "Add companies DynamoDB table to the construct"
  dependencies: [T-008-05]
  estimate: S
  description: |
    Inside CognitoUserPoolConstruct, add a Table resource:
      - partitionKey: id (String).
      - billingMode: PAY_PER_REQUEST.
      - pointInTimeRecovery: envName === 'prod'.
      - removalPolicy: envName === 'prod' ? RETAIN : DESTROY.
    The table name is `chatsaas-${envName}-companies`. The post-confirmation
    Lambda's IAM policy is granted PutItem on this table by ARN.
  acceptance: one Table resource in the template; IAM policy scoped to the ARN;
    conditional PITR setting.

- id: T-008-07
  title: "Wire the construct into ChatSaaSStack (WI-004)"
  dependencies: [T-008-05]
  estimate: S
  description: |
    Modify infra/lib/chat-saas-stack.ts (introduced in WI-004) to instantiate
    CognitoUserPoolConstruct with dev defaults:
      - cognitoDomainPrefix: 'chatsaas-dev' (must be globally unique; CDK
        synth does not validate, so a future env-specific override may be
        needed).
      - callbackUrls.dev: ['http://localhost:3000/callback'].
      - signOutUrls.dev: ['http://localhost:3000/'].
      - adminAllowlist: [] (empty for dev; populated via context in prod).
      - mfaMode: 'optional'.
      - advancedSecurityMode: 'audit'.
    The Aurora stack (WI-004) and the identity stack share the same Stack in
    this round; a follow-up splits them when the API stack joins.
  acceptance: ChatSaaSStack synth is clean; both the Aurora and the Cognito
    resources are present.

- id: T-008-08
  title: "Write cdk assertions test suite"
  dependencies: [T-008-07]
  estimate: M
  description: |
    Write infra/test/cognito-user-pool.test.ts using aws-cdk-lib/assertions.
    Asserts the 12 acceptance-criteria items 1–6 and 10. Includes a snapshot
    test of the full template (CDK snapshot of the stack).
  acceptance: pnpm -F infra test passes; coverage of the password policy,
    custom attribute mutability, OAuth flow, callback URLs, group precedence,
    deletion protection, token validity, and the four CfnOutputs.

- id: T-008-09
  title: "Write Lambda handler unit tests"
  dependencies: [T-008-03, T-008-04]
  estimate: M
  description: |
    Write infra/test/lambda-handlers.test.ts:
      - post-confirmation: with a stubbed DynamoDBClient and CognitoIdentityProviderClient,
        assert PutItem is called with the right shape and ConditionExpression,
        and that AdminUpdateUserAttributes is called with the right UserAttributes.
      - pre-token-generation: pure-function tests for customer and admin
        users, including the throw on admin-without-MFA.
  acceptance: tests pass; no real AWS calls.

- id: T-008-10
  title: "Add kaddo guard:questions and README in the construct"
  dependencies: [T-008-05]
  estimate: S
  description: |
    Add a `kaddo guard:questions` block in infra/lib/cognito-user-pool.ts (or a
    sibling kaddo.yaml) asking the four open questions from this WI
    (companies table location, admin allowlist mechanism, MFA optional vs
    required, hosted UI vs custom UI). Add a short README in infra/lib/
    documenting the construct's contract (props, outputs, security model,
    follow-up WIs).
  acceptance: README and guard block exist; questions are answerable from the
    construct props.

- id: T-008-11
  title: "Update WI-003 verifier docs to reference the new outputs"
  dependencies: [T-008-05]
  estimate: S
  description: |
    Add a section to apps/functions/src/auth/verifyCognitoJwt.ts (or its
    README) noting that COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, COGNITO_REGION
    are now sourced from the CognitoUserPoolConstruct CfnOutputs. The actual
    env-var wiring in the API stack is a follow-up WI; this task is
    documentation only.
  acceptance: README updated; no code change in apps/functions.

- id: T-008-12
  title: "Run final validation: pnpm -F infra synth && pnpm -F infra test"
  dependencies: [T-008-08, T-008-09, T-008-10, T-008-11]
  estimate: S
  description: |
    Final check before marking the WI ready: synth is clean (no warnings
    about unresolved tokens, no deprecated props), all vitest cases pass,
    no diff in apps/functions except the schema registry addition.
  acceptance: pnpm -F infra synth clean; pnpm -F infra test green; git diff
    scoped to infra/, apps/functions/src/db/schema.ts, and the OpenAPI yaml.
```

## Risks and Mitigations

1. **Pre-token-generation Lambda failure silently breaks all auth.** If the Lambda throws or times out, Cognito returns no token and the frontend surfaces a generic error; an outage in this function takes the whole product offline because the JWT is required for every authenticated request. *Mitigation:* the construct wires a CloudWatch alarm on `Errors >= 1 over 5 min` for the Lambda, with a placeholder SNS topic (the topic wiring is a follow-up so a human is paged). The handler is a pure function (no I/O), so the surface area for failure is small. A vitest case asserts the alarm exists.
2. **Post-confirmation Lambda race with first login.** The pre-token-generation Lambda runs before the post-confirmation Lambda has finished writing the Company record (if the order were reversed) or before the user has even finished email verification. *Mitigation:* the pre-token-generation Lambda reads `custom:company_id` from the user attributes (Cognito) and NOT from DynamoDB; the post-confirmation Lambda is responsible for writing the DynamoDB Company record AND for setting `custom:company_id` on the user via `AdminUpdateUserAttributes` BEFORE returning. The first authenticated API call that hits the companies table fires only after the user has been redirected to the dashboard, by which time the post-confirmation Lambda has completed. The pre-token-generation claim is decoupled from the DynamoDB write.
3. **Group assignment without company allowlist.** If the `adminAllowlist` prop is empty, every user lands in `customer` (intended for dev). If it is misconfigured (e.g. a wildcard match), users may be silently promoted to `admin`. *Mitigation:* the pre-token-generation Lambda treats an empty allowlist as `customer`-only and never assigns `admin`; the matching is exact-string on email, not substring; a vitest case asserts that an empty allowlist defaults all users to `customer`. The allowlist is a CDK context value, not an SSM secret, so it is visible in the synthesized template — operators can review it.
4. **Hosted UI rate limits on sign-up.** Cognito throttles self-service sign-up at the User Pool level. A mass-registration attempt can block legitimate sign-ups. *Mitigation:* the construct enables Advanced Security Features in `audit` mode for dev and `enforced` mode for prod (configurable). The flag is exposed in construct props; the operator can flip it. Adaptive authentication is a Cognito-billed feature, so the cost is documented in the README.
5. **Custom attribute immutability mistake.** `custom:company_id` is set once at sign-up and must be immutable thereafter. If the construct (or a future operator) sets `mutable: true` and the Lambda or a user self-edit changes it, the JWT's tenant claim no longer matches the DynamoDB Company record and the user is locked out of their own data. *Mitigation:* the construct hardcodes `mutable: false` for `custom:company_id`; a vitest case asserts the property explicitly. A follow-up WI adds an IAM policy that denies `cognito-idp:AdminUpdateUserAttributes` on this attribute for non-admin principals, with an SCP-style guard at the account level.
6. **Region lock between Cognito and the API.** The User Pool's issuer URL is region-specific and is the verifier's `iss` claim. If WI-004 is synthesized for `us-east-1` and this WI is synthesized for `eu-west-1`, the verifier (WI-003) rejects every token. *Mitigation:* the construct reads the same `region` CDK context as WI-004 and emits it as the `IssuerUrl` output. The WI-003 env wiring (a follow-up) sources region from the same context. The construct also fails synth if the region is missing.
7. **Custom domain deferred.** This WI uses a Cognito prefix domain (`https://chatSaas-dev.auth.{region}.amazoncognito.com`). The URL changes if the User Pool is deleted and recreated. *Mitigation:* for dev, the URL is treated as ephemeral. For prod, a follow-up WI (suggested id WI-009) provisions ACM + CloudFront + UserPoolDomain with `auth.chatsaas.com` and the Hosted UI customization.
8. **Lambda bundle drift.** The two Lambdas in this WI are the first non-CDK Lambda code in the repo. Bundle/version drift between the CDK-bundled Lambdas and the future `apps/functions` Lambdas is a risk. *Mitigation:* jose 5.9.3 and @aws-sdk/client-cognito-identity-provider 3.1116.0 are pinned via esbuild externals resolution and documented in the construct README. The pre-token-generation Lambda has zero AWS SDK calls (pure function), so it carries no SDK version dependency.

## Validation

- **kaddo guard:questions**: four open questions (see below). The construct must be instantiated with a non-empty `adminAllowlist` for any non-dev environment; the CDK synth fails with a clear error if `envName === 'prod'` and `adminAllowlist` is empty.
- **vitest assertions**: 12+ assertions in `cognito-user-pool.test.ts` covering resource counts, password policy, custom-attribute mutability, OAuth flow, callback URLs, group precedence, deletion protection, token validity, advanced security mode, IAM policy scoping on the post-confirmation Lambda, and the four CfnOutputs. 5+ unit tests in `lambda-handlers.test.ts` covering the post-confirmation conditional write, the AdminUpdateUserAttributes call, the pre-token-generation claim copy for customer and admin, the admin-without-MFA throw, and the no-AWS-SDK-calls property of the pre-token-generation handler.
- **cdk synth clean**: `pnpm -F infra synth` produces a CloudFormation template with no warnings about unresolved tokens, no deprecated props, no missing context. The construct's snapshot is committed.

## Chain-of-custody invariants (added 2026-08-28, founder decision option D for DC-005-1)

WI-005's critical tenant-isolation risk (sub→company_id mapping) is closed by AC-13 + AC-14. With them in place:
- The SignUp action cannot accept `custom:company_id` from the client (write-attribute whitelist excludes it).
- No IAM principal other than the post-confirmation Lambda can write `custom:company_id`.
- The post-confirmation Lambda is the single writer of `custom:company_id` server-side.
- The pre-token-generation Lambda is pure (AC-7) and copies the claim into the token.
- Result: the JWT `custom:company_id` is trustworthy for tenant authorization. The `auth/claims.ts` SECURITY NOTE is updated during implementation to describe this custody chain; the `resolveTenant` module in WI-005 reads the JWT claim directly and references this WI's AC-13 + AC-14 in its source comment.

Future multi-org growth (one user, multiple companies) migrates `resolveTenant` to a DynamoDB `users` table. The change is localized to one module; the custody chain in this WI remains the source of truth at sign-up.

## Open Questions

All decision candidates for this WI are resolved (2026-08-28). The WI is eligible to move from `draft` to `ready` once its implementation tasks begin.

1. **`companies` table location — RESOLVED (2026-08-28, founder decision: Option B, owned by the CDK construct).** The table is provisioned in `infra/lib/lambda/companies-table.ts` and `apps/functions` reads the table name from a CDK stack output. The `apps/functions/src/db/schema.ts` registry gets a `TABLES.COMPANIES` constant that points at the output. Lifecycle belongs to the identity stack for the MVP; a follow-up WI can consolidate schema ownership once the convention is clearer.
2. **Admin allowlist mechanism — RESOLVED (2026-08-28, founder decision: hybrid A for dev, B for prod).** Dev stacks use a hardcoded allowlist in CDK context (visible in synth, easy to review). Prod uses the SSM parameter `/chatsaas/{envName}/admin-allowlist`, read at deploy time. The construct picks the source based on `envName`. The deploy runbook documents the `aws ssm put-parameter` step.
3. **MFA scope — RESOLVED (2026-08-28, founder decision: optional for `customer`, required for `admin`).** `admin` group membership triggers the pre-token-generation TOTP throw (existing AC-9). `customer` users may enroll in TOTP optionally but are not required to. The product call is documented in the proposal.
4. **Hosted UI vs custom UI — RESOLVED (2026-08-28, founder decision: hosted UI for MVP).** Default Cognito hosted UI with the standard logo and a placeholder CSS. The custom sign-in/sign-up page in `apps/web/` (with the chatSaaS branding per ADR-007) is a follow-up WI that consumes this WI's stack outputs and replaces the hosted-UI redirect.
5. **Region for the User Pool — RESOLVED (2026-08-28, founder decision: same region as Aurora, default `us-east-1`).** The User Pool, Aurora, and the rest of the stack are in the same region. Bedrock is enabled in `us-east-1`. Multi-region split is a follow-up WI; the construct's region-agnostic design keeps that follow-up localized.

## Files to create / modify

Create:

- `infra/lib/cognito-user-pool.ts` — the main construct.
- `infra/lib/lambda/post-confirmation.ts` — DynamoDB + Cognito trigger handler.
- `infra/lib/lambda/pre-token-generation.ts` — pure-function claim injector.
- `infra/lib/lambda/companies-table.ts` — DynamoDB table definition (owned here per open question 1).
- `infra/lib/cognito-policies.ts` — IAM policy builders for the post-confirmation Lambda (DynamoDB + Cognito).
- `infra/test/cognito-user-pool.test.ts` — cdk assertions suite.
- `infra/test/lambda-handlers.test.ts` — handler unit tests.
- `infra/lib/README.md` — construct contract and follow-up WI list.

Modify:

- `infra/lib/chat-saas-stack.ts` (from WI-004) — instantiate `CognitoUserPoolConstruct`.
- `infra/package.json` (from WI-004) — add `@aws-sdk/client-cognito-identity-provider@3.1116.0`, `jose@5.9.3`, `uuid@9.x`, `@types/uuid`.
- `infra/tsconfig.json` (from WI-004) — include `lib/lambda/**/*` in the compile glob.
- `apps/functions/src/db/schema.ts` — add `Company` type and `TABLES.COMPANIES` constant.
- `openspec/WI-002-backend-endpoints-openapi.yaml` — declare `Company` resource; document `custom:company_id` as a required JWT claim for tenant-scoped endpoints.
- `knowledge/delivery/work-items/completed/WI-003-server-bootstrap-with-cognito-jwt-verifier.md` — append a "Provisioned by WI-008" note pointing at the construct's CfnOutputs.

## Sister WIs

- **WI-004** (ready, in-flight) — CDK app bootstrap with Aurora + pgvector + RDS Proxy. This WI extends the same CDK app and the same `ChatSaaSStack`. The two are synthesized together in the dev environment.
- **WI-005** (planned) — Bedrock Knowledge Base wiring + ingest pipeline. Depends on WI-008 because the ingest pipeline's per-document tenant scoping uses `custom:company_id` from the user's JWT.
- **WI-006** (planned) — apps/web/ Next.js frontend (login + dashboard). Depends on WI-008 because the frontend's hosted-UI OAuth code + PKCE flow consumes `UserPoolDomain`, `UserPoolClientId`, and the callback URLs from this WI's stack outputs.
- **WI-007** (planned) — API stack wiring (Fastify + Lambda + API Gateway HTTP API) that consumes the Cognito stack outputs as env vars (`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_REGION`). Depends on WI-008 because the Fastify server bootstrap (WI-003) reads these env vars to construct the JWKS URL.

## Out-of-scope follow-ups (from Judgment Day, target b885002870bd8a6d, 2026-09-01)

- **Pre-token-generation admin gate can never pass (WARNING, pre-existing)**: `hasTotpMfa` reads `cognito:mfa_enabled`, an attribute Cognito does not expose to the Pre-Token Generation event, so every admin-group token issuance throws even for TOTP-enrolled users; the `cognito:groups` array override also fights the aws-lambda typing. Latent while `MfaConfiguration: OFF` and the admin allowlist is empty.
