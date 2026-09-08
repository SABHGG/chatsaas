import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { RetrievalError, type ChatbotScope } from './types.js'

/**
 * Resolves the chatbot row ONCE and derives the tenant scope from it.
 *
 * R-1 (CRITICAL): this is the ONLY trusted source of `company_id` on the
 * anonymous public path. Nothing from the request body, query string, or
 * headers may influence tenant scope — the caller passes the `chatbotId`
 * path parameter and nothing else.
 */
export interface ResolveScopeInput {
  chatbotsTable: string
  chatbotId: string
}

/**
 * Single DynamoDB read of the chatbot row.
 * Throws typed `RetrievalError`:
 *  - `chatbot_not_found`   → mapped to 404
 *  - `chatbot_not_published` → mapped to 404 (NOT 403: don't leak existence
 *    of draft/archived chatbots on the public path)
 */
export async function resolveChatbotScope(
  ddb: DynamoDBDocumentClient,
  input: ResolveScopeInput,
): Promise<ChatbotScope> {
  const resp = await ddb.send(
    new GetCommand({ TableName: input.chatbotsTable, Key: { id: input.chatbotId } }),
  )
  const row = resp.Item as
    | { id: string; companyId: string; status: string; settings?: { system_prompt?: string } }
    | undefined

  if (!row) {
    throw new RetrievalError('chatbot_not_found', `Chatbot ${input.chatbotId} not found`)
  }
  if (row.status !== 'published') {
    throw new RetrievalError(
      'chatbot_not_published',
      `Chatbot ${input.chatbotId} is not published`,
    )
  }

  return {
    chatbotId: row.id,
    companyId: row.companyId,
    status: 'published',
    systemPrompt: row.settings?.system_prompt,
    settings: row.settings,
  }
}
