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
- Userinfo: `GET /oauth2/userInfo` (Cognito endpoint) – returns `sub`, `email`, `custom:company_id` etc.
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

### Publishing
- **Publish chatbot**
  - `POST /api/chatbots/:chatbotId/publish`
  - Body: none
  - Response (200): updated chatbot with `status: "published"` and `published_at` set.
- **Unpublish chatbot**
  - `POST /api/chatbots/:chatbotId/unpublish`
  - Body: none
  - Response: chatbot with `status: "draft"` and `published_at: null`.

### Usage & Billing (read‑only for MVP)
- **Get current usage**
  - `GET /api/usage/current`
  - Response:
    ```json
    {
      "data": {
        "period_start": "YYYY-MM-DD",
        "period_end": "YYYY-MM-DD",
        "conversations_count": integer,
        "document_processing_volume": integer,
        "chatbots_count": integer,
        "credits_used": integer,
        "plan_limit_conversations": integer|null,
        "plan_limit_chatbots": integer|null,
        "plan_limit_document_volume": integer|null
      }
    }
    ```

## Public Chatbot Endpoints
These endpoints are accessed via the public URL or iframe embed (e.g., `https://chat.saas.company.com/:chatbotId` or via embed script).

### Load chatbot settings (for widget initialization)
- `GET /api/public/chatbots/:chatbotId/config`
- Response:
  ```json
  {
    "data": {
      "chatbotId": "uuid",
      "name": "string", // display name for widget header (optional)
      "placeholder": "string", // input placeholder text
      "welcomeMessage": "string", // first message from bot
      "theme": { "primary": "#2563eb", "background": "#ffffff", "text": "#111827" } // example
    }
  }
  ```
- If chatbot not found or not published: 404.

### Send message and receive streaming response
- `POST /api/public/chatbots/:chatbotId/chat`
- Body: `{ "message": "string", "conversationId": "string|null" }`
  - `conversationId` optional; if omitted or invalid, a new conversation is started.
- Response: `Content-Type: text/event-stream` (Server‑Sent Events).
  - Events:
    - `event: metadata` – data: `{ "conversationId": "uuid" }` (sent first)
    - `event: token` – data: `{ "text": "string" }` (repeated for each token/piece)
    - `event: done` – data: `{ "isComplete": true }` (final)
  - On error: `event: error` – data: `{ "message": "string" }` and close stream.

### Get conversation history (optional, for widget to display past messages)
- `GET /api/public/conversations/:conversationId/messages`
- Response:
  ```json
  {
    "data": [
      { "role": "user|assistant", "content": "string", "createdAt": "ISO string" },
      ...
    ]
  }
  ```

## Rate Limiting & Security
- Public chat endpoints: limit to 30 requests per minute per IP per chatbot.
- Admin endpoints: limit to 120 requests per minute per company.
- All endpoints validate input size and schema.
- Errors never leak stack traces.

## Future Extensions (not for MVP)
- Webhooks for conversation events.
- Admin analytics endpoints.
- Document re‑processing endpoint.
- API keys for server‑to‑server integrations.

---

## Work Units (for implementation)
Each endpoint or group can be a work unit:
1. **Auth helper** – utility to verify Cognito JWT and extract company_id.
2. **Chatbots CRUD** – routes `/api/chatbots` (GET, POST, PATCH, DELETE).
3. **Document upload & management** – routes for `/api/chatbots/:chatbotId/documents`.
4. **Publish/unpublish** – routes for `/api/chatbots/:chatbotId/publish` and `/unpublish`.
5. **Usage endpoint** – `/api/usage/current`.
6. **Public config endpoint** – `/api/public/chatbots/:chatbotId/config`.
7. **Public chat endpoint** – SSE `/api/public/chatbots/:chatbotId/chat`.
8. **Conversation history endpoint** – optional.
9. **Middleware** – auth, rate limiting, error handling, validation.
10. **Database models** – implement or update ORM/models per data-model.md.
11. **Integration tests** – for each endpoint group.
12. **Documentation** – keep this spec in sync with implementation.

---

## Finish
Unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, this spec, and every shipping raster carrying its provenance.