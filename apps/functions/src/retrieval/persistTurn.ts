import { createHash, randomUUID } from 'node:crypto'
import { UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { PersistedTurn } from './types.js'

/**
 * Persists one turn: a Conversation row (upserted, created on the first
 * turn) plus two Message rows (user + assistant) carrying the EXACT token
 * counts from the Bedrock response (R-8 — no estimates anywhere here).
 *
 * R-6/visitor identity: `visitorId` is derived SERVER-SIDE from the request
 * IP + User-Agent; it is never read from a client field.
 */

/** Server-side visitor identity: hash of IP + User-Agent (never client-supplied). */
export function hashVisitorId(ip: string, userAgent: string): string {
  return createHash('sha256').update(`${ip}|${userAgent}`).digest('hex').slice(0, 32)
}

export interface PersistTurnInput {
  conversationsTable: string
  messagesTable: string
  chatbotId: string
  /** Trusted scope from the chatbot row — never a request field. */
  companyId: string
  conversationId: string
  visitorId: string
  question: string
  answer: string
  /** Exact usage.input_tokens from the Bedrock response. */
  inputTokens: number
  /** Exact usage.output_tokens from the Bedrock response. */
  outputTokens: number
}

export async function persistTurn(
  ddb: DynamoDBDocumentClient,
  input: PersistTurnInput,
): Promise<PersistedTurn> {
  const now = new Date().toISOString()

  // Conversation upsert: create-if-new for immutable fields, bump counters.
  // DocumentClient UpdateCommand with `if_not_exists` + `ADD` composes
  // safely under concurrent first turns.
  await ddb.send(
    new UpdateCommand({
      TableName: input.conversationsTable,
      Key: { id: input.conversationId },
      UpdateExpression:
        'SET chatbotId = if_not_exists(chatbotId, :cb), ' +
        'companyId = if_not_exists(companyId, :co), ' +
        'visitorId = if_not_exists(visitorId, :v), ' +
        'createdAt = if_not_exists(createdAt, :now), ' +
        'lastMessageAt = :now ' +
        'ADD messageCount :two',
      ExpressionAttributeValues: {
        ':cb': input.chatbotId,
        ':co': input.companyId,
        ':v': input.visitorId,
        ':now': now,
        ':two': 2,
      },
    }),
  )

  const userMessageId = randomUUID()
  const assistantMessageId = randomUUID()

  // Two Message rows. The assistant row carries the exact Bedrock usage
  // tokens; the user row carries the exact input tokens for attribution.
  await ddb.send(
    new PutCommand({
      TableName: input.messagesTable,
      Item: {
        id: userMessageId,
        conversationId: input.conversationId,
        chatbotId: input.chatbotId,
        companyId: input.companyId,
        role: 'user',
        content: input.question,
        visitorId: input.visitorId,
        createdAt: now,
      },
    }),
  )
  await ddb.send(
    new PutCommand({
      TableName: input.messagesTable,
      Item: {
        id: assistantMessageId,
        conversationId: input.conversationId,
        chatbotId: input.chatbotId,
        companyId: input.companyId,
        role: 'assistant',
        content: input.answer,
        visitorId: input.visitorId,
        // R-8: exact tokens from the Bedrock response, never estimates.
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        createdAt: now,
      },
    }),
  )

  return {
    conversationId: input.conversationId,
    userMessageId,
    assistantMessageId,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
  }
}
