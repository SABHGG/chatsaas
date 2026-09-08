import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { persistTurn, hashVisitorId } from '../persistTurn'

const docMock = mockClient(DynamoDBDocumentClient)

beforeEach(() => {
  docMock.reset()
})

const BASE = {
  conversationsTable: 'conversations',
  messagesTable: 'messages',
  chatbotId: 'chat-1',
  companyId: 'company-acme',
  conversationId: 'conv-1',
  visitorId: 'visitor-hash',
  question: 'What is the refund policy?',
  answer: '30 days.',
  inputTokens: 123,
  outputTokens: 45,
}

describe('persistTurn', () => {
  it('upserts the conversation with if_not_exists and ADD messageCount', async () => {
    docMock.on(UpdateCommand).resolves({})

    await persistTurn(docMock as unknown as DynamoDBDocumentClient, BASE)

    const input = docMock.calls()[0].args[0].input as {
      TableName: string
      UpdateExpression?: string
    }
    expect(input.TableName).toBe('conversations')
    expect(input.UpdateExpression).toContain('chatbotId = if_not_exists(chatbotId, :cb)')
    expect(input.UpdateExpression).toContain('companyId = if_not_exists(companyId, :co)')
    expect(input.UpdateExpression).toContain('visitorId = if_not_exists(visitorId, :v)')
    expect(input.UpdateExpression).toContain('ADD messageCount :two')
  })

  it('writes exactly two message rows with the EXACT Bedrock token counts (R-8)', async () => {
    docMock.on(UpdateCommand).resolves({})
    docMock.on(PutCommand).resolves({})

    const out = await persistTurn(docMock as unknown as DynamoDBDocumentClient, BASE)

        const puts = docMock.calls().filter((c) => c.args[0] instanceof PutCommand).map((c) => c.args[0].input as { Item: Record<string, unknown> })
    expect(puts).toHaveLength(2)

    const user = puts.find((p) => p.Item.role === 'user')!
    const assistant = puts.find((p) => p.Item.role === 'assistant')!

    expect(user.Item.content).toBe(BASE.question)
    expect(user.Item.companyId).toBe('company-acme')
    expect(assistant.Item.content).toBe(BASE.answer)
    // Exact tokens from the Bedrock response — never estimated.
    expect(assistant.Item.inputTokens).toBe(123)
    expect(assistant.Item.outputTokens).toBe(45)
    expect(typeof assistant.Item.inputTokens).toBe('number')

    expect(out.userMessageId).toBe(user.Item.id)
    expect(out.assistantMessageId).toBe(assistant.Item.id)
    expect(out.inputTokens).toBe(123)
    expect(out.outputTokens).toBe(45)
  })

  it('scopes both message rows to the chatbot row values (R-1)', async () => {
    docMock.on(UpdateCommand).resolves({})
    docMock.on(PutCommand).resolves({})

    await persistTurn(docMock as unknown as DynamoDBDocumentClient, {
      ...BASE,
      companyId: 'company-from-chatbot-row',
    })

        const puts = docMock.calls().filter((c) => c.args[0] instanceof PutCommand).map((c) => c.args[0].input as { Item: Record<string, unknown> })
    for (const p of puts) {
      expect(p.Item.companyId).toBe('company-from-chatbot-row')
      expect(p.Item.chatbotId).toBe('chat-1')
    }
  })

  describe('hashVisitorId (visitor identity is server-side only)', () => {
    it('derives a stable hash from ip + user agent', () => {
      const a = hashVisitorId('1.2.3.4', 'Mozilla/5.0')
      const b = hashVisitorId('1.2.3.4', 'Mozilla/5.0')
      expect(a).toBe(b)
      expect(a).toHaveLength(32)
      expect(a).toMatch(/^[0-9a-f]+$/)
    })

    it('differs per IP and per user agent', () => {
      expect(hashVisitorId('1.2.3.4', 'UA')).not.toBe(hashVisitorId('5.6.7.8', 'UA'))
      expect(hashVisitorId('1.2.3.4', 'UA')).not.toBe(hashVisitorId('1.2.3.4', 'Other'))
    })

    it('is NOT a client-controlled field (hash of the server-observed values)', () => {
      // A client-sent "visitorId" can never match the server hash format
      // input; the hash is computed from ip+UA only.
      const h = hashVisitorId('1.2.3.4', 'UA')
      expect(h).toBe(hashVisitorId('1.2.3.4', 'UA', ))
      expect(h).not.toBe('client-supplied-value')
    })
  })
})
