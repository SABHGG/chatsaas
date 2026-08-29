import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data'
import { chatPublicMessageFactory, type ChatRouteEnv } from '../chatPublicMessage'

const lowMock = mockClient(DynamoDBClient)
const docMock = mockClient(DynamoDBDocumentClient)
const brMock = mockClient(BedrockRuntimeClient)
const rdsMock = mockClient(RDSDataClient)

const ENV: ChatRouteEnv = {
  chatbotsTable: 'chatbots',
  conversationsTable: 'conversations',
  messagesTable: 'messages',
  subscriptionsTable: 'subscriptions',
  creditsTable: 'credits',
  rds: {
    clusterArn: 'arn:aws:rds:us-east-1:1:cluster:c',
    secretArn: 'arn:aws:secretsmanager:us-east-1:1:secret:s',
    database: 'chatsaas',
    region: 'us-east-1',
  },
  bedrockRegion: 'us-east-1',
  embedModelId: 'amazon.titan-embed-text-v2:0',
  chatModelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
  topK: 10,
  maxTokens: 1024,
  temperature: 0.2,
  contextTurns: 4,
  fallbackAnswer: 'fallback-answer-text',
}

function chatbotRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chat-1',
    companyId: 'company-acme',
    status: 'published',
    settings: { system_prompt: 'You are the Acme assistant.' },
    ...overrides,
  }
}

/** Subscription (no limit hit) + credits (no prepaid opt-in) defaults. */
function defaultsNoBlocks() {
  docMock
    .on(GetCommand, { TableName: 'chatbots', Key: { id: 'chat-1' } })
    .resolves({ Item: chatbotRow() })
  docMock
    .on(GetCommand, { TableName: 'subscriptions', Key: { id: 'company-acme' } })
    .resolves({ Item: { id: 'company-acme', status: 'active', monthlyLimit: 100, monthlyUsed: 10 } })
  docMock
    .on(GetCommand, { TableName: 'credits', Key: { id: 'company-acme' } })
    .resolves({ Item: { id: 'company-acme', balance: 0, creditsOptedIn: false } })
  // Default: any conversation row belongs to the resolved scope (JD-A-001).
  docMock
    .on(GetCommand, { TableName: 'conversations' })
    .resolves({ Item: { id: 'conv', chatbotId: 'chat-1', companyId: 'company-acme' } })
      brMock.on(InvokeModelCommand).callsFake((input: InvokeModelCommand["input"]) => {
        const body = JSON.parse(String(input.body))
    if (body.inputText !== undefined) {
      return Promise.resolve({
        body: new TextEncoder().encode(JSON.stringify({ embedding: [0.1, 0.2, 0.3] })),
      })
    }
    return Promise.resolve({
      body: new TextEncoder().encode(
        JSON.stringify({
          content: [{ type: 'text', text: 'grounded answer' }],
          usage: { input_tokens: 100, output_tokens: 20 },
        }),
      ),
    })
  })
  rdsMock.on(ExecuteStatementCommand).resolves({
    records: [[{ stringValue: 'r1' }, { stringValue: 'chunk content' }, { doubleValue: 0.1 }]],
  })
  docMock.on(PutCommand).resolves({})
  docMock.on(UpdateCommand).resolves({})
}

beforeEach(() => {
  lowMock.reset()
  docMock.reset()
  brMock.reset()
  rdsMock.reset()
})

const URL = '/chat-1/message'

describe('chatPublicMessage handler (WI-006 pipeline)', () => {
  it('returns 200 with answer, conversation_id and sources', async () => {
    defaultsNoBlocks()
    const fastify = await chatPublicMessageFactory(ENV)

    const res = await fastify.inject({ method: 'POST', url: URL, payload: { message: 'hi' } })
    expect(res.statusCode).toBe(200)
    const data = JSON.parse(res.payload).data
    expect(data.answer).toBe('grounded answer')
    expect(typeof data.conversation_id).toBe('string')
    expect(data.sources).toEqual([{ id: 'r1', content: 'chunk content', score: 0.1 }])
    await fastify.close()
  })

  it('R-1: a spoofed body company_id is rejected and never reaches the query', async () => {
    defaultsNoBlocks()
    const fastify = await chatPublicMessageFactory(ENV)

    const res = await fastify.inject({
      method: 'POST',
      url: URL,
      payload: { message: 'hi', company_id: 'spoofed-company' },
    })
    // Strict Zod schema rejects the extra field outright.
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.payload).error).toBe('Validation failed')

    // And even the happy-path SQL only ever receives the chatbot-row scope.
    await fastify.inject({ method: 'POST', url: URL, payload: { message: 'hi' } })
    const sqlInput = rdsMock.calls()[0].args[0].input as ExecuteStatementCommand['input']
    const params = Object.fromEntries(
      ((sqlInput.parameters ?? []) as Array<{ name?: string; value?: { stringValue?: string } }>).map((p) => [p.name, p.value?.stringValue]),
    )
    expect(params.companyId).toBe('company-acme')
    expect(params.companyId).not.toBe('spoofed-company')
    await fastify.close()
  })

  it('404 for a draft chatbot (no existence leak; NOT 403)', async () => {
    docMock
      .on(GetCommand, { TableName: 'chatbots', Key: { id: 'chat-1' } })
      .resolves({ Item: chatbotRow({ status: 'draft' }) })
    const fastify = await chatPublicMessageFactory(ENV)

    const res = await fastify.inject({ method: 'POST', url: URL, payload: { message: 'hi' } })
    expect(res.statusCode).toBe(404)
    expect(brMock.calls()).toHaveLength(0) // nothing else ran
    await fastify.close()
  })

  it('404 for a missing chatbot', async () => {
    docMock.on(GetCommand, { TableName: 'chatbots', Key: { id: 'chat-1' } }).resolves({})
    const fastify = await chatPublicMessageFactory(ENV)

    const res = await fastify.inject({ method: 'POST', url: URL, payload: { message: 'hi' } })
    expect(res.statusCode).toBe(404)
    await fastify.close()
  })

  it('402 with NO Bedrock call when the monthly limit is exhausted (AC 4)', async () => {
    docMock
      .on(GetCommand, { TableName: 'chatbots', Key: { id: 'chat-1' } })
      .resolves({ Item: chatbotRow() })
    docMock
      .on(GetCommand, { TableName: 'subscriptions', Key: { id: 'company-acme' } })
      .resolves({ Item: { id: 'company-acme', status: 'active', monthlyLimit: 100, monthlyUsed: 100 } })
    docMock
      .on(GetCommand, { TableName: 'credits', Key: { id: 'company-acme' } })
      .resolves({ Item: { id: 'company-acme', balance: 0, creditsOptedIn: false } })
    const fastify = await chatPublicMessageFactory(ENV)

    const res = await fastify.inject({ method: 'POST', url: URL, payload: { message: 'hi' } })
    expect(res.statusCode).toBe(402)
    expect(JSON.parse(res.payload).error).toMatch(/monthly conversation limit/)
    expect(brMock.calls()).toHaveLength(0)
    expect(rdsMock.calls()).toHaveLength(0)
    await fastify.close()
  })

  it('402 with NO Bedrock call when prepaid credits fail the atomic debit (R-2)', async () => {
    docMock
      .on(GetCommand, { TableName: 'chatbots', Key: { id: 'chat-1' } })
      .resolves({ Item: chatbotRow() })
    docMock
      .on(GetCommand, { TableName: 'subscriptions', Key: { id: 'company-acme' } })
      .resolves({ Item: { id: 'company-acme', status: 'active', monthlyLimit: 100, monthlyUsed: 10 } })
    docMock
      .on(GetCommand, { TableName: 'credits', Key: { id: 'company-acme' } })
      .resolves({ Item: { id: 'company-acme', balance: 0, creditsOptedIn: true } })
    // The atomic debit fails the ConditionExpression → 402 before Bedrock.
    docMock.on(UpdateCommand).callsFake(async () => {
      const err = new Error('conditional failed')
      err.name = 'ConditionalCheckFailedException'
      throw err
    })
    const fastify = await chatPublicMessageFactory(ENV)

    const res = await fastify.inject({ method: 'POST', url: URL, payload: { message: 'hi' } })
    expect(res.statusCode).toBe(402)
    expect(JSON.parse(res.payload).error).toMatch(/prepaid credits/i)
    expect(brMock.calls()).toHaveLength(0)
    await fastify.close()
  })

  it('R-2: two concurrent requests, balance=1 → exactly one 200 and one 402', async () => {
    docMock
      .on(GetCommand, { TableName: 'chatbots', Key: { id: 'chat-1' } })
      .resolves({ Item: chatbotRow() })
    docMock
      .on(GetCommand, { TableName: 'subscriptions', Key: { id: 'company-acme' } })
      .resolves({ Item: { id: 'company-acme', status: 'active', monthlyLimit: 100, monthlyUsed: 10 } })
    docMock
      .on(GetCommand, { TableName: 'credits', Key: { id: 'company-acme' } })
      .resolves({ Item: { id: 'company-acme', balance: 1, creditsOptedIn: true } })

    // Atomic DynamoDB conditional decrement simulation.
    let balance = 1
    docMock.on(UpdateCommand, { TableName: "credits" }).callsFake(async (cmd: UpdateCommand["input"]) => {
      const cost = Number(cmd.ExpressionAttributeValues?.[":cost"] ?? 1)
      if (balance >= cost) {
        balance -= cost
        return { Attributes: { balance } }
      }
      const err = new Error('conditional failed')
      err.name = 'ConditionalCheckFailedException'
      throw err
    })
    // The winner goes on to Bedrock + RDS + persist.
    brMock.on(InvokeModelCommand).callsFake((input: InvokeModelCommand["input"]) => {
      const body = JSON.parse(String(input.body))
      if (body.inputText !== undefined) {
        return Promise.resolve({
          body: new TextEncoder().encode(JSON.stringify({ embedding: [0.1] })),
        })
      }
      return Promise.resolve({
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        ),
      })
    })
    rdsMock.on(ExecuteStatementCommand).resolves({ records: [] })
    docMock.on(PutCommand).resolves({})

    const fastify = await chatPublicMessageFactory(ENV)
    const [r1, r2] = await Promise.all([
      fastify.inject({ method: 'POST', url: URL, payload: { message: 'a' } }),
      fastify.inject({ method: 'POST', url: URL, payload: { message: 'b' } }),
    ])

    const codes = [r1.statusCode, r2.statusCode].sort()
    expect(codes).toEqual([200, 402])
    expect(balance).toBe(0)
    await fastify.close()
  })

  it('surfaces the 80% alert header when usage crosses the threshold', async () => {
    defaultsNoBlocks()
    docMock
      .on(GetCommand, { TableName: 'subscriptions', Key: { id: 'company-acme' } })
      .resolves({ Item: { id: 'company-acme', status: 'active', monthlyLimit: 100, monthlyUsed: 85 } })
    const fastify = await chatPublicMessageFactory(ENV)

    const res = await fastify.inject({ method: 'POST', url: URL, payload: { message: 'hi' } })
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-credit-alert']).toBe('80%')
    await fastify.close()
  })

  it('empty retrieval still answers with the configured fallback (AC 9: never empty, never 500)', async () => {
    docMock
      .on(GetCommand, { TableName: 'chatbots', Key: { id: 'chat-1' } })
      .resolves({ Item: chatbotRow() })
    docMock
      .on(GetCommand, { TableName: 'subscriptions', Key: { id: 'company-acme' } })
      .resolves({ Item: { id: 'company-acme', status: 'active', monthlyLimit: 100, monthlyUsed: 0 } })
    docMock
      .on(GetCommand, { TableName: 'credits', Key: { id: 'company-acme' } })
      .resolves({ Item: { id: 'company-acme', balance: 0, creditsOptedIn: false } })
    brMock.on(InvokeModelCommand).callsFake((input: InvokeModelCommand["input"]) => {
      const body = JSON.parse(String(input.body))
      if (body.inputText !== undefined) {
        return Promise.resolve({
          body: new TextEncoder().encode(JSON.stringify({ embedding: [0.1] })),
        })
      }
      // Claude returns empty content on the no-context prompt.
      return Promise.resolve({
        body: new TextEncoder().encode(
          JSON.stringify({ content: [{ type: 'text', text: '' }], usage: { input_tokens: 5, output_tokens: 0 } }),
        ),
      })
    })
    rdsMock.on(ExecuteStatementCommand).resolves({ records: [] })
    docMock.on(PutCommand).resolves({})
    docMock.on(UpdateCommand).resolves({})
    const fastify = await chatPublicMessageFactory(ENV)

    const res = await fastify.inject({ method: 'POST', url: URL, payload: { message: 'hi' } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).data.answer).toBe('fallback-answer-text')
    await fastify.close()
  })

  it('loads rolling context from DynamoDB when conversation_id is supplied (R-6)', async () => {
    defaultsNoBlocks()
    docMock.on(QueryCommand).resolves({
      Items: [
        { role: 'user', content: 'first question', createdAt: '2026-08-28T00:00:00Z' },
        { role: 'assistant', content: 'first answer', createdAt: '2026-08-28T00:00:01Z' },
      ],
    })
    const fastify = await chatPublicMessageFactory(ENV)

    const res = await fastify.inject({
      method: 'POST',
      url: URL,
      payload: { message: 'follow up?', conversation_id: '11111111-1111-4111-8111-111111111111' },
    })
    expect(res.statusCode).toBe(200)
        expect(docMock.calls().filter((c) => c.args[0] instanceof QueryCommand)).toHaveLength(1)
    // The completion prompt included the history turns.
    const completionCall = brMock
      .calls()
      .map((c) => c.args[0].input as InvokeModelCommand['input'])
      .find((i) => !String(i.body).includes('inputText'))!
    expect(String(completionCall.body)).toContain('first question')
    await fastify.close()
  })

  it('persists the exact Bedrock token counts (R-8)', async () => {
    defaultsNoBlocks()
    const fastify = await chatPublicMessageFactory(ENV)
    await fastify.inject({ method: 'POST', url: URL, payload: { message: 'hi' } })

        const puts = docMock
      .calls()
      .filter((c) => c.args[0] instanceof PutCommand)
      .map((c) => c.args[0].input as { Item: Record<string, unknown> })
    const assistant = puts.find((p) => p.Item.role === "assistant")!
    expect(assistant.Item.inputTokens).toBe(100)
    expect(assistant.Item.outputTokens).toBe(20)
    await fastify.close()
  })

  it('maps Bedrock ValidationException to 500 without leaking internals', async () => {
    docMock
      .on(GetCommand, { TableName: 'chatbots', Key: { id: 'chat-1' } })
      .resolves({ Item: chatbotRow() })
    docMock
      .on(GetCommand, { TableName: 'subscriptions', Key: { id: 'company-acme' } })
      .resolves({ Item: { id: 'company-acme', status: 'active', monthlyLimit: 100, monthlyUsed: 0 } })
    docMock
      .on(GetCommand, { TableName: 'credits', Key: { id: 'company-acme' } })
      .resolves({ Item: { id: 'company-acme', balance: 0, creditsOptedIn: false } })
        brMock.on(InvokeModelCommand).callsFake((input: InvokeModelCommand["input"]) => {
          if (String(input.body).includes("inputText")) {
            return Promise.resolve({
              body: new TextEncoder().encode(JSON.stringify({ embedding: [0.1] })),
            })
          }
          const err = new Error("bad request shape")
          err.name = "ValidationException"
          return Promise.reject(err)
        })
        rdsMock
          .on(ExecuteStatementCommand)
          .resolves({ records: [[{ stringValue: "r1" }, { stringValue: "chunk" }, { doubleValue: 0.1 }]] })
    const fastify = await chatPublicMessageFactory(ENV)

    const res = await fastify.inject({ method: 'POST', url: URL, payload: { message: 'hi' } })
    expect(res.statusCode).toBe(500)
    const payload = JSON.parse(res.payload)
    expect(payload.error).toMatch(/Bedrock rejected the request/)
    expect(payload.timestamp).toBeDefined()
    expect(payload.path).toBe(URL)
    await fastify.close()
  })

  it('rejects messages over 2000 chars with 400 (strict validation)', async () => {
    const fastify = await chatPublicMessageFactory(ENV)
    const res = await fastify.inject({
      method: 'POST',
      url: URL,
      payload: { message: 'x'.repeat(2001) },
    })
    expect(res.statusCode).toBe(400)
    await fastify.close()
  })

  it('server registers the route with no JWT preHook (T-11)', async () => {
    defaultsNoBlocks()
    // The plugin itself is registered without opts.preHook in server.ts; here
    // we assert the route answers anonymously (no 401 without a token).
    const fastify = await chatPublicMessageFactory(ENV)
    const res = await fastify.inject({ method: 'POST', url: URL, payload: { message: 'hi' } })
    expect(res.statusCode).not.toBe(401)
    await fastify.close()
  })
      it('AC 9 (JD-A-003): zero retrieval rows return the fallback even when the completion is non-empty', async () => {
        docMock
          .on(GetCommand, { TableName: 'chatbots', Key: { id: 'chat-1' } })
          .resolves({ Item: chatbotRow() })
        docMock
          .on(GetCommand, { TableName: 'subscriptions', Key: { id: 'company-acme' } })
          .resolves({ Item: { id: 'company-acme', status: 'active', monthlyLimit: 100, monthlyUsed: 0 } })
        docMock
          .on(GetCommand, { TableName: 'credits', Key: { id: 'company-acme' } })
          .resolves({ Item: { id: 'company-acme', balance: 0, creditsOptedIn: false } })
        brMock.on(InvokeModelCommand).callsFake((input: InvokeModelCommand["input"]) => {
          const body = JSON.parse(String(input.body))
          if (body.inputText !== undefined) {
            return Promise.resolve({
              body: new TextEncoder().encode(JSON.stringify({ embedding: [0.1] })),
            })
          }
          // Ungrounded completion on the no-context prompt.
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ type: 'text', text: 'hallucinated answer' }], usage: { input_tokens: 5, output_tokens: 3 } }),
            ),
          })
        })
        rdsMock.on(ExecuteStatementCommand).resolves({ records: [] })
        docMock.on(PutCommand).resolves({})
        docMock.on(UpdateCommand).resolves({})
        const fastify = await chatPublicMessageFactory(ENV)

        const res = await fastify.inject({ method: 'POST', url: URL, payload: { message: 'hi' } })
        expect(res.statusCode).toBe(200)
        expect(JSON.parse(res.payload).data.answer).toBe('fallback-answer-text')
        await fastify.close()
      })

      it('JD-A-001: a conversation_id owned by another tenant is treated as absent (no history leak)', async () => {
        defaultsNoBlocks()
        // The supplied conversation belongs to a DIFFERENT chatbot/company.
        docMock
          .on(GetCommand, { TableName: 'conversations', Key: { id: '11111111-1111-4111-8111-111111111111' } })
          .resolves({ Item: { id: '11111111-1111-4111-8111-111111111111', chatbotId: 'chat-other', companyId: 'company-other' } })
        // Foreign tenant history would leak if it were ever queried.
        docMock.on(QueryCommand).resolves({
          Items: [{ role: 'user', content: 'FOREIGN SECRET', createdAt: '2026-08-28T00:00:00Z' }],
        })
        const fastify = await chatPublicMessageFactory(ENV)

        const res = await fastify.inject({
          method: 'POST',
          url: URL,
          payload: { message: 'hi', conversation_id: '11111111-1111-4111-8111-111111111111' },
        })
        expect(res.statusCode).toBe(200)
        // No messages query ever ran for the foreign conversation.
        expect(docMock.calls().filter((c) => c.args[0] instanceof QueryCommand)).toHaveLength(0)
        // The prompt never contained foreign content.
        const completionCall = brMock
          .calls()
          .map((c) => c.args[0].input as InvokeModelCommand['input'])
          .find((i) => !String(i.body).includes('inputText'))!
        expect(String(completionCall.body)).not.toContain('FOREIGN SECRET')
        // A FRESH conversation id is returned, not the foreign one.
        const data = JSON.parse(res.payload).data
        expect(data.conversation_id).not.toBe('11111111-1111-4111-8111-111111111111')
        await fastify.close()
      })

      it('JD-A-001: a valid conversation_id owned by this scope still loads history', async () => {
        defaultsNoBlocks()
        docMock
          .on(GetCommand, { TableName: 'conversations', Key: { id: '11111111-1111-4111-8111-111111111111' } })
          .resolves({ Item: { id: '11111111-1111-4111-8111-111111111111', chatbotId: 'chat-1', companyId: 'company-acme' } })
        docMock.on(QueryCommand).resolves({
          Items: [{ role: 'user', content: 'first question', createdAt: '2026-08-28T00:00:00Z' }],
        })
        const fastify = await chatPublicMessageFactory(ENV)

        const res = await fastify.inject({
          method: 'POST',
          url: URL,
          payload: { message: 'follow up?', conversation_id: '11111111-1111-4111-8111-111111111111' },
        })
        expect(res.statusCode).toBe(200)
        expect(JSON.parse(res.payload).data.conversation_id).toBe('11111111-1111-4111-8111-111111111111')
        expect(docMock.calls().filter((c) => c.args[0] instanceof QueryCommand)).toHaveLength(1)
        await fastify.close()
      })

      it('JD-A-002: monthlyUsed is atomically incremented after a successful turn', async () => {
        defaultsNoBlocks()
        const fastify = await chatPublicMessageFactory(ENV)
        await fastify.inject({ method: 'POST', url: URL, payload: { message: 'hi' } })

        const incr = docMock
          .calls()
          .filter((c) => c.args[0] instanceof UpdateCommand)
          .map((c) => c.args[0].input as UpdateCommand['input'])
          .find((u) => u.TableName === 'subscriptions')
        expect(incr).toBeDefined()
        expect(incr!.Key).toEqual({ id: 'company-acme' })
        expect(incr!.UpdateExpression).toBe('ADD monthlyUsed :one')
        await fastify.close()
      })

      it('JD-A-002: monthlyUsed is NOT incremented on a 402 limit block', async () => {
        docMock
          .on(GetCommand, { TableName: 'chatbots', Key: { id: 'chat-1' } })
          .resolves({ Item: chatbotRow() })
        docMock
          .on(GetCommand, { TableName: 'subscriptions', Key: { id: 'company-acme' } })
          .resolves({ Item: { id: 'company-acme', status: 'active', monthlyLimit: 100, monthlyUsed: 100 } })
        docMock
          .on(GetCommand, { TableName: 'credits', Key: { id: 'company-acme' } })
          .resolves({ Item: { id: 'company-acme', balance: 0, creditsOptedIn: false } })
        const fastify = await chatPublicMessageFactory(ENV)

        const res = await fastify.inject({ method: 'POST', url: URL, payload: { message: 'hi' } })
        expect(res.statusCode).toBe(402)
        expect(
          docMock
            .calls()
            .filter((c) => c.args[0] instanceof UpdateCommand)
            .map((c) => c.args[0].input as UpdateCommand['input'])
            .filter((u) => u.TableName === 'subscriptions'),
        ).toHaveLength(0)
        await fastify.close()
      })

      it('JD-B-003: best-effort credit refund when completion fails after a successful debit', async () => {
        docMock
          .on(GetCommand, { TableName: 'chatbots', Key: { id: 'chat-1' } })
          .resolves({ Item: chatbotRow() })
        docMock
          .on(GetCommand, { TableName: 'subscriptions', Key: { id: 'company-acme' } })
          .resolves({ Item: { id: 'company-acme', status: 'active', monthlyLimit: 100, monthlyUsed: 0 } })
        docMock
          .on(GetCommand, { TableName: 'credits', Key: { id: 'company-acme' } })
          .resolves({ Item: { id: 'company-acme', balance: 5, creditsOptedIn: true } })
        brMock.on(InvokeModelCommand).callsFake((input: InvokeModelCommand["input"]) => {
          const body = JSON.parse(String(input.body))
          if (body.inputText !== undefined) {
            return Promise.resolve({
              body: new TextEncoder().encode(JSON.stringify({ embedding: [0.1] })),
            })
          }
          const err = new Error('bedrock rejected')
          err.name = 'ValidationException'
          return Promise.reject(err)
        })
        rdsMock
          .on(ExecuteStatementCommand)
          .resolves({ records: [[{ stringValue: 'r1' }, { stringValue: 'chunk' }, { doubleValue: 0.1 }]] })
        docMock.on(PutCommand).resolves({})
        docMock.on(UpdateCommand).resolves({})
        const fastify = await chatPublicMessageFactory(ENV)

        const res = await fastify.inject({ method: 'POST', url: URL, payload: { message: 'hi' } })
        expect(res.statusCode).toBe(500)

        const updates = docMock
          .calls()
          .filter((c) => c.args[0] instanceof UpdateCommand)
          .map((c) => c.args[0].input as UpdateCommand['input'])
        // Debit happened (SET balance) AND refund fired (ADD balance :one).
        const debit = updates.find((u) => u.TableName === 'credits' && u.UpdateExpression!.startsWith('SET balance'))
        expect(debit).toBeDefined()
        const refund = updates.find(
          (u) => u.TableName === 'credits' && u.UpdateExpression === 'ADD balance :one',
        )
        expect(refund).toBeDefined()
        expect(refund!.Key).toEqual({ id: 'company-acme' })
        await fastify.close()
      })

      it('JD-B-003: no refund when the debit itself fails (402, nothing was debited)', async () => {
        docMock
          .on(GetCommand, { TableName: 'chatbots', Key: { id: 'chat-1' } })
          .resolves({ Item: chatbotRow() })
        docMock
          .on(GetCommand, { TableName: 'subscriptions', Key: { id: 'company-acme' } })
          .resolves({ Item: { id: 'company-acme', status: 'active', monthlyLimit: 100, monthlyUsed: 10 } })
        docMock
          .on(GetCommand, { TableName: 'credits', Key: { id: 'company-acme' } })
          .resolves({ Item: { id: 'company-acme', balance: 0, creditsOptedIn: true } })
        docMock.on(UpdateCommand).callsFake(async () => {
          const err = new Error('conditional failed')
          err.name = 'ConditionalCheckFailedException'
          throw err
        })
        const fastify = await chatPublicMessageFactory(ENV)

        const res = await fastify.inject({ method: 'POST', url: URL, payload: { message: 'hi' } })
        expect(res.statusCode).toBe(402)
        expect(brMock.calls()).toHaveLength(0)
        // Only the failed debit update ran — no refund.
        expect(
          docMock
            .calls()
            .filter((c) => c.args[0] instanceof UpdateCommand)
            .map((c) => c.args[0].input as UpdateCommand['input'])
            .filter((u) => u.UpdateExpression === 'ADD balance :one'),
        ).toHaveLength(0)
        await fastify.close()
      })

})
