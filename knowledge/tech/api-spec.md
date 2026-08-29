# API Specification

## Overview

Defines the REST/JSON API contract for the chatSaaS platform, covering admin dashboard operations and public chatbot endpoints. All API paths are prefixed with `/api`.

## Authentication

- Admin endpoints require a valid Amazon Cognito JWT (access token) in the `Authorization: Bearer <token>` header.
- Public chatbot endpoints are open (no authentication) but rate‑limited by IP and chatbot ID.

## Common Responses

- Success: JSON object with `data` field.
- Error: JSON object with `error` (string) and optionally `details`.
- HTTP status codes: 200 for success, 201 for created, 400 for validation, 401/403 for auth, 404 for not found, 429 for rate limit, 500 for server error.

## Admin Dashboard Endpoints

### Company & Auth (handled by Cognito, not custom API)

- **Userinfo**: `GET /oauth2/userInfo` (Cognito endpoint) – returns `sub`, `email`, `custom:company_id` etc.
  - The frontend uses this to determine the current company.

### Chatbots

- **List chatbots for company**
  - `GET /api/chatbots`
  - Query: none
  - Response: 
    ```json
    {
      "data": [
        {
          "id": "uuid",
          "name": "string",
          "status": "draft|published|archived",
          "document_count": integer,
          "created_at": "ISO string",
          "updated_at": "ISO string",
          "published_at": "ISO string|null"
        }
      ]
    }
    ```
- **Create a chatbot (draft)**
  - `POST /api/chatbots`
  - Body: `{ "name": "string", "description": "string|null" }`
  - Response (201): the created chatbot object (same shape as list item).
- **Update chatbot metadata**
  - `PATCH /api/chatbots/:id`
  - Body: `{ "name?": "string", "description?": "string|null" }`
  - Response: updated chatbot object.
- **Delete / Archive chatbot**
  - `DELETE /api/chatbots/:id`
  - Response: `{ "data": null }` (soft delete → status `archived`).

### Documents

- **Upload document (multipart/form-data)**
  - `POST /api/chatbots/:chatbotId/documents`
  - Form: `file` (required), max 10 MB, allowed types: `.pdf`, `.docx`, `.txt`, `.md`.
  - Response (201):
    ```json
    {
      "data": {
        "id": "uuid",
        "file_name": "string",
        "file_size": integer,
        "content_type": "string",
        "status": "uploaded",
        "created_at": "ISO string",
        "updated_at": "ISO string"
      }
    }
    ```
- **List documents for a chatbot**
  - `GET /api/chatbots/:chatbotId/documents`
  - Response: array of document objects (same shape as upload response, plus status).
- **Get document status**
  - `GET /api/documents/:documentId`
  - Response: document object.

### Content

- **Get content by ID**
  - `GET /api/content/:id`
  - Response:
    ```json
    {
      "success": true,
      "data": {
        "id": "string",
        "title": "string|null",
        "message": "string|null",
        "authorId": "string",
        "createdAt": "ISO string",
        "status": "string"
      }
    }
    ```

### Credits

- **Get credit balance**
  - `GET /api/credits/balance` (authenticated via Cognito JWT)
  - Response:
    ```json
    { "success": true, "data": { "balance": integer } }
    ```
  - Errors: 401 `UNAUTHENTICATED`.

- **Debit credits**
  - `POST /api/credits/debit`
  - Body: `{ "amount": integer (>=1), "reason": "string|null" }`
  - Response:
    ```json
    { "success": true, "data": { "newBalance": integer } }
    ```
  - Errors: 401, 402 insufficient credits (atomic `UpdateItem` + `ConditionExpression`, WI-002 pattern).

- **Replenish credits**
  - `POST /api/credits/replenish`
  - Body: `{ "amount": integer (>=1) }`
  - Response:
    ```json
    { "success": true, "data": { "newBalance": integer } }
    ```

### Plans

- **List available plans**
  - `GET /api/plans/available`
  - Response:
    ```json
    {
      "success": true,
      "data": [
        {
          "id": "string",
          "name": "string",
          "monthly_conversation_limit": integer,
          "monthly_credit_allocated": integer,
          "price_monthly": integer (cents),
          "status": "active|inactive"
        }
      ]
    }
    ```

- **Subscribe to a plan**
  - `POST /api/plans/subscribe`
  - Body: `{ "planId": "string", "paymentMethodId": "string|null" }`
  - Response:
    ```json
    {
      "success": true,
      "data": {
        "status": "string",
        "planId": "string",
        "currentPeriodEnd": "ISO string"
      }
    }
    ```

### Public Chat (legacy demo surface, WI-002)

- `GET /api/chat/public` — list recent public messages (demo data path).
- `POST /api/chat/public` — create a public message (demo data path).

### Health

- `GET /healthz` — liveness probe: `{ "status": "ok" }`.

### Chatbot Management & Publishing (PLANNED — WI-001, not yet implemented)

The following endpoints are contract-defined but have no implementation yet. The
single source of truth for their shapes is this document until WI-001 lands:

- `GET /api/chatbots` — list chatbots for the company.
- `POST /api/chatbots` — create a chatbot (draft).
- `PATCH /api/chatbots/:id` — update chatbot metadata.
- `DELETE /api/chatbots/:id` — soft delete (status `archived`).
- `POST /api/chatbots/:chatbotId/publish` — publish chatbot (body `{ "plan_id": "uuid" }`).
- `GET /api/chatbots/published` — list published chatbots.
- `GET /api/public/chatbots/:chatbotId/config` — widget initialization settings.
- `GET /api/public/chatbots/:chatbotId/iframe` — iframe embed snippet.

> **Naming note (2026-08-29):** the implemented credits/plans endpoints use
> `/api/credits/balance|debit|replenish` and `/api/plans/available|subscribe`.
> Earlier drafts named them `/api/credits/snapshot|converse` and `/api/plans`;
> the implemented paths above are authoritative.

## Public Chatbot Endpoints

These endpoints are accessed via the public URL or iframe embed (e.g., `https://chat.saas.company.com/:chatbotId` or via embed script).

### Load chatbot settings (for widget initialization) — PLANNED (WI-001, not yet implemented)

- `GET /api/public/chatbots/:chatbotId/config`
- Response:
  ```json
  {
    "data": {
      "chatbotId": "uuid",
      "name": "string", // display name for widget header (optional)
      "placeholder": "string", // input placeholder text
      "welcomeMessage": "string", // first message from bot
      "theme": { "primary": "string", "secondary": "string" },
      "status": "draft|published",
      "expires_at": "ISO string|null"
    }
  }
  ```

  - **Send a message to a published chatbot (WI-006)**
    - `POST /api/public/chat/:chatbotId/message` (anonymous, no JWT)
    - Body:
      ```json
      { "message": "string (1-2000 chars)", "conversation_id": "uuid|null" }
      ```
      - Strict body: no client-supplied `history` or tenant fields (R-1/R-6). Tenant scope is always resolved server-side from the chatbot row.
      - `conversation_id` is honored only when the conversation belongs to the same chatbot + company; otherwise a fresh conversation starts.
    - Response (200):
      ```json
      {
        "data": {
          "answer": "string",
          "conversation_id": "uuid",
          "sources": [{ "id": "string", "content": "string", "score": number }]
        }
      }
      ```
    - Headers: `x-credit-alert: 80%` when monthly usage crosses the 80% threshold (ADR-005).
    - Errors: 400 validation (strict), 402 monthly limit exhausted / prepaid credits exhausted (hard block, no Bedrock call), 404 chatbot not found or not published (deliberately not 403), 429 rate limit, 500 Bedrock/DB failure.
    - Zero retrieval rows → configured fallback answer (`CHAT_FALLBACK_ANSWER`), never an ungrounded completion (AC 9).
    - Latency budget: p50 < 3 s, p95 < 8 s. Streaming (SSE) out of scope.

### Generate iframe embed code — PLANNED (WI-001, not yet implemented)

- `GET /api/public/chatbots/:chatbotId/iframe`
- Response:
  ```json
  {
    "data": {
      "iframe_src": "string (HTML iframe snippet)",
      "expires_at": "ISO string|null"
    }
  }
  ```

## Rate Limits

- Public chatbot endpoints: 100 requests per minute per IP.
- Admin endpoints: 1000 requests per minute per authenticated user.
- Credit consumption: 1 credit per completed conversation.

## Error Format

- All error responses follow: `{ "error": "string", "details": {...}, "path": "string", "timestamp": "ISO string" }`
- Specific error codes:
  - `VALIDATION_ERROR` (400)
  - `AUTHENTICATION_ERROR` (401)
  - `AUTHORIZATION_ERROR` (403)
  - `NOT_FOUND_ERROR` (404)
  - `RATE_LIMIT_ERROR` (429)
  - `SERVER_ERROR` (500)