import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { resolveChatbotScope } from '../resolveChatbotScope'
import { RetrievalError } from '../types'

const ddbMock = mockClient(DynamoDBDocumentClient)

const CHATBOTS_TABLE = 'chatbots'

beforeEach(() => {
  ddbMock.reset()
})

function publishedRow() {
  return {
    id: 'chat-1',
    companyId: 'company-acme',
    ownerSub: 'owner-1',
    name: 'Acme bot',
    status: 'published',
    settings: { system_prompt: 'You are the Acme assistant.' },
    createdAt: '2026-08-28T00:00:00Z',
    updatedAt: '2026-08-28T00:00:00Z',
  }
}

describe('resolveChatbotScope', () => {
  it('returns scope from the chatbot row (R-1: single read, company from the row)', async () => {
    ddbMock.on(GetCommand).resolves({ Item: publishedRow() })

    const scope = await resolveChatbotScope(ddbMock as unknown as DynamoDBDocumentClient, {
      chatbotsTable: CHATBOTS_TABLE,
      chatbotId: 'chat-1',
    })

    expect(scope).toEqual({
      chatbotId: 'chat-1',
      companyId: 'company-acme',
      status: 'published',
      systemPrompt: 'You are the Acme assistant.',
      settings: { system_prompt: 'You are the Acme assistant.' },
    })
    expect(ddbMock.calls()).toHaveLength(1)
  })

  it('throws typed chatbot_not_found for a missing row', async () => {
    ddbMock.on(GetCommand).resolves({})
    await expect(
      resolveChatbotScope(ddbMock as unknown as DynamoDBDocumentClient, {
        chatbotsTable: CHATBOTS_TABLE,
        chatbotId: 'missing',
      }),
    ).rejects.toMatchObject({ code: 'chatbot_not_found', name: 'RetrievalError' })
  })

  it.each(['draft', 'archived'])('throws typed chatbot_not_published for status=%s', async (status) => {
    ddbMock.on(GetCommand).resolves({ Item: { ...publishedRow(), status } })
    await expect(
      resolveChatbotScope(ddbMock as unknown as DynamoDBDocumentClient, {
        chatbotsTable: CHATBOTS_TABLE,
        chatbotId: 'chat-1',
      }),
    ).rejects.toBeInstanceOf(RetrievalError)
    await expect(
      resolveChatbotScope(ddbMock as unknown as DynamoDBDocumentClient, {
        chatbotsTable: CHATBOTS_TABLE,
        chatbotId: 'chat-1',
      }),
    ).rejects.toMatchObject({ code: 'chatbot_not_published' })
  })

  it('queries by the path-param chatbotId only — a spoofed company_id is never consulted', async () => {
    ddbMock.on(GetCommand).resolves({ Item: publishedRow() })
    await resolveChatbotScope(ddbMock as unknown as DynamoDBDocumentClient, {
      chatbotsTable: CHATBOTS_TABLE,
      chatbotId: 'chat-1',
    })
    const input = ddbMock.calls()[0].args[0].input as { Key: Record<string, string> }
    // The read key is the chatbot id; there is no company_id input at all.
    expect(input.Key).toEqual({ id: 'chat-1' })
    expect(Object.keys(input.Key)).not.toContain('companyId')
  })
})
