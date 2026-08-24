---
type: feature
id: WI-002
title: "Define backend endpoints for public chatbot"
knowledge_level: K2
status: draft
phase: next
initiative: "RM-001"
domains:
  - "Backend APIs"
  - "Authentication"
  - "Billing and Credits"
  - "AI Inference"
related_capabilities:
  - "Public chatbot access"
  - "Iframe embedding"
  - "Company document knowledge"
  - "Conversational responses"
  - "Subscription plan management"
code: []
created_at: 2026-08-24
source: manual
source_id: manual-WI-002
source_title: "Define backend endpoints for public chatbot"
source_context: "Backend-first workflow: define API spec, data models, and endpoints before frontend rebuild. Required to establish contracts for the Operator's Board dashboard."
source_initiative: "RM-001"
source_roadmap_initiative: "RM-001"
source_work_item_candidate: WI-CANDIDATE-001
source_title: "Define the first public chatbot creation and publishing experience"
source_initiative_title: "Public Document-Grounded Chatbot"
expected_value: "API spec + data models + endpoints documented for auth (Cognito), plan/credits management, doc upload + preprocessing, bot creation, publishing (URL + iframe), and credit ledger — all in English, ready for implementation."
risks:
  - "AWS service selection for Cognito, Bedrock, S3, DynamoDB undecided."
  - "Cost attribution and credit system design not yet modeled."
  - "Schema drift between API spec and DynamoDB/RDS choices."
dependencies:
  - "ADR-003: Technology Stack Selection (tools over which this backend sits)"
  - "ADR-007: Visual Design System — The Operator's Board (frontend contracts must align)"
  - "API spec must align with DynamoDB table design and credit ledger model."
decision_candidates:
  - "DC-003: Cognito vs. custom auth"
  - "DC-004: DynamoDB vs. RDS for credit ledger"
  - "DC-005: Bedrock model selection for RAG"
related_decisions:
  - "ADR-003"
  - "ADR-007"
scope_confidence:
  level: medium
  reasons:
    - "Backend contracts are well-understood domain patterns; unknowns are service choices and cost modeling."
impact_analysis:
  surfaces:
    frontend:
      status: unblocked
      note: "Backend endpoints defined → frontend can implement Operator's Board dashboard against stable contracts."
    backend:
      status: in_progress
      note: "This work item defines the contracts."
---