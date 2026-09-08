import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { chatbotsFactory, iframeSnippet } from '../chatbots'
import { chatbotsPublicFactory } from '../chatbotsPublic'
import type { UserPreHook } from '../hooks'
import type { CognitoAccessTokenClaims } from '../../auth/claims'

const ddbMock = mockClient(DynamoDBDocumentClient)

const claims: CognitoAccessTokenClaims = {
  sub: 'user-1',
  iss: 'iss',
  aud: 'aud',
  exp: 1_000_000_000,
  iat: 999_000_000,
  token_use: 'access',
  'custom:company_id': 'company-acme',
} as CognitoAccessTokenClaims

const preHook: UserPreHook = async (request) => {
  ;(request as { user?: CognitoAccessTokenClaims }).user = claims
}

const chatbotRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'chat-1',
  companyId: 'company-acme',
  ownerSub: 'user-1',
  name: 'Support Bot',
  status: 'draft',
  settings: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const adminEnv = { chatbotsTable: 'chatbots-tbl', documentsTable: 'docs-tbl' }

beforeEach(() => {
  ddbMock.reset()
  process.env.AWS_REGION = 'us-east-1'
  delete process.env.PUBLIC_CHAT_BASE_URL
})

afterEach(() => {
  delete process.env.PUBLIC_CHAT_BASE_URL
})

describe('WI-001 admin chatbot routes', () => {
  it('returns 401 when the preHook does not set claims', async () => {
    const noClaims: UserPreHook = async () => undefined
    const fastify = await chatbotsFactory(noClaims, adminEnv)
    const res = await fastify.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(401)
    await fastify.close()
  })

  it('lists chatbots filtered by the caller company', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [chatbotRow(), chatbotRow({ id: 'chat-2', status: 'published', publishedAt: '2026-01-02T00:00:00.000Z', planId: 'plan-1' })],
    })
    const fastify = await chatbotsFactory(preHook, adminEnv)
    const res = await fastify.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.success).toBe(true)
    expect(body.data.map((c: { id: string }) => c.id).sort()).toEqual(['chat-1', 'chat-2'])
    // Tenant filtering happens server-side in Dynamo via the FilterExpression
    // (mock returns whatever we give it, so assert the expression).
    const scan = ddbMock.calls()[0]
    const scanInput = scan.args[0].input as ScanCommand['input']
    expect(scanInput.FilterExpression).toContain('companyId = :co')
    expect(scanInput.ExpressionAttributeValues?.[':co']).toBe('company-acme')
    const item = body.data[0]
    expect(item).toMatchObject({
      id: 'chat-1',
      name: 'Support Bot',
      status: 'draft',
      document_count: 0,
      created_at: '2026-01-01T00:00:00.000Z',
      published_at: null,
    })
    await fastify.close()
  })

  it('returns 201 and a draft on create', async () => {
    ddbMock.on(PutCommand).resolves({})
    const fastify = await chatbotsFactory(preHook, adminEnv)
    const res = await fastify.inject({
      method: 'POST',
      url: '/',
      payload: { name: 'New Bot', description: 'helps' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ name: 'New Bot', status: 'draft', document_count: 0, published_at: null })
    const put = ddbMock.calls()[0]
    expect((put.args[0].input as PutCommand['input']).Item).toMatchObject({
      companyId: 'company-acme',
      ownerSub: 'user-1',
      status: 'draft',
    })
    await fastify.close()
  })

  it('rejects extra fields on create (strict body)', async () => {
    const fastify = await chatbotsFactory(preHook, adminEnv)
    const res = await fastify.inject({
      method: 'POST',
      url: '/',
      payload: { name: 'Bot', company_id: 'company-OTHER' },
    })
    expect(res.statusCode).toBe(400)
    expect(ddbMock.calls()).toHaveLength(0)
    await fastify.close()
  })

  it('rejects extra fields on patch (strict body)', async () => {
    ddbMock.on(GetCommand).resolves({ Item: chatbotRow() })
    const fastify = await chatbotsFactory(preHook, adminEnv)
    const res = await fastify.inject({
      method: 'PATCH',
      url: '/chat-1',
      payload: { name: 'x', companyId: 'company-OTHER' },
    })
    expect(res.statusCode).toBe(400)
    expect(ddbMock.calls()).toHaveLength(0)
    await fastify.close()
  })

  it('returns 404 when patching a missing chatbot', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined })
    const fastify = await chatbotsFactory(preHook, adminEnv)
    const res = await fastify.inject({ method: 'PATCH', url: 'chat-MISSING', payload: { name: 'x' } })
    expect(res.statusCode).toBe(404)
    await fastify.close()
  })

  it('returns 403 when patching a foreign chatbot', async () => {
    ddbMock.on(GetCommand).resolves({ Item: chatbotRow({ companyId: 'company-OTHER' }) })
    const fastify = await chatbotsFactory(preHook, adminEnv)
    const res = await fastify.inject({ method: 'PATCH', url: '/chat-1', payload: { name: 'x' } })
    expect(res.statusCode).toBe(403)
    await fastify.close()
  })

  it('patches name and description for an owned chatbot', async () => {
    ddbMock.on(GetCommand).resolves({ Item: chatbotRow() })
    ddbMock.on(UpdateCommand).resolves({
      Attributes: chatbotRow({ name: 'Renamed', description: 'd', updatedAt: '2026-01-03T00:00:00.000Z' }),
    })
    const fastify = await chatbotsFactory(preHook, adminEnv)
    const res = await fastify.inject({ method: 'PATCH', url: '/chat-1', payload: { name: 'Renamed' } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ success: true, data: { name: 'Renamed' } })
    await fastify.close()
  })

  it('returns 404 when deleting an archived chatbot', async () => {
    ddbMock.on(GetCommand).resolves({ Item: chatbotRow({ status: 'archived' }) })
    const fastify = await chatbotsFactory(preHook, adminEnv)
    const res = await fastify.inject({ method: 'DELETE', url: '/chat-1' })
    expect(res.statusCode).toBe(404)
    await fastify.close()
  })

  it('archives (soft delete) an owned chatbot', async () => {
    ddbMock.on(GetCommand).resolves({ Item: chatbotRow() })
    ddbMock.on(UpdateCommand).resolves({})
    const fastify = await chatbotsFactory(preHook, adminEnv)
    const res = await fastify.inject({ method: 'DELETE', url: '/chat-1' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ success: true, data: null })
    const update = ddbMock.calls().find((c) => c.args[0].constructor.name === 'UpdateCommand') ?? ddbMock.calls()[1]
    expect((update.args[0].input as UpdateCommand['input']).UpdateExpression).toContain(':archived')
    await fastify.close()
  })

  it('returns 403 when deleting a foreign chatbot', async () => {
    ddbMock.on(GetCommand).resolves({ Item: chatbotRow({ companyId: 'company-OTHER' }) })
    const fastify = await chatbotsFactory(preHook, adminEnv)
    const res = await fastify.inject({ method: 'DELETE', url: '/chat-1' })
    expect(res.statusCode).toBe(403)
    expect(ddbMock.calls().filter((c) => c.args[0].constructor.name === 'UpdateCommand')).toHaveLength(0)
    await fastify.close()
  })

  it('publishes an owned draft and returns url + iframe_src', async () => {
    ddbMock.on(GetCommand).resolves({ Item: chatbotRow() })
    ddbMock.on(UpdateCommand).resolves({})
    const fastify = await chatbotsFactory(preHook, adminEnv)
    const res = await fastify.inject({
      method: 'POST',
      url: '/chat-1/publish',
      payload: { plan_id: 'plan-123' },
    })
    expect(res.statusCode).toBe(202)
    const body = res.json()
    expect(body.success).toBe(true)
    expect(body.data).toEqual({
      status: 'published',
      url: 'https://chat.chatsaas.local/chat-1',
      iframe_src: iframeSnippet('https://chat.chatsaas.local/chat-1'),
      expires_at: null,
    })
    expect(body.data.iframe_src).toContain('<iframe src="https://chat.chatsaas.local/chat-1"')
    const update = ddbMock.calls().find((c) => c.args[0].constructor.name === 'UpdateCommand')!
    const updateInput = update.args[0].input as UpdateCommand['input']
    expect(updateInput.UpdateExpression).toContain(':published')
    expect(updateInput.ExpressionAttributeValues?.[':plan']).toBe('plan-123')
    await fastify.close()
  })

  it('honors PUBLIC_CHAT_BASE_URL and is idempotent on re-publish', async () => {
    process.env.PUBLIC_CHAT_BASE_URL = 'https://chat.example.com/'
    ddbMock.on(GetCommand).resolves({ Item: chatbotRow({ status: 'published' }) })
    ddbMock.on(UpdateCommand).resolves({})
    const fastify = await chatbotsFactory(preHook, adminEnv)
    for (let i = 0; i < 2; i++) {
      const res = await fastify.inject({
        method: 'POST',
        url: '/chat-1/publish',
        payload: { plan_id: 'plan-123' },
      })
      expect(res.statusCode).toBe(202)
      expect(res.json().data.url).toBe('https://chat.example.com/chat-1')
    }
    await fastify.close()
  })

  it('rejects publish without plan_id (400)', async () => {
    const fastify = await chatbotsFactory(preHook, adminEnv)
    const res = await fastify.inject({ method: 'POST', url: '/chat-1/publish', payload: {} })
    expect(res.statusCode).toBe(400)
    expect(ddbMock.calls()).toHaveLength(0)
    await fastify.close()
  })

  it('rejects publish with extra fields (400)', async () => {
    const fastify = await chatbotsFactory(preHook, adminEnv)
    const res = await fastify.inject({
      method: 'POST',
      url: '/chat-1/publish',
      payload: { plan_id: 'p', status: 'published' },
    })
    expect(res.statusCode).toBe(400)
    await fastify.close()
  })

  it('returns 403 when publishing a foreign chatbot', async () => {
    ddbMock.on(GetCommand).resolves({ Item: chatbotRow({ companyId: 'company-OTHER' }) })
    const fastify = await chatbotsFactory(preHook, adminEnv)
    const res = await fastify.inject({
      method: 'POST',
      url: '/chat-1/publish',
      payload: { plan_id: 'plan-123' },
    })
    expect(res.statusCode).toBe(403)
    await fastify.close()
  })

  it('returns 404 when publishing a missing chatbot', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined })
    const fastify = await chatbotsFactory(preHook, adminEnv)
    const res = await fastify.inject({
      method: 'POST',
      url: '/chat-MISSING/publish',
      payload: { plan_id: 'plan-123' },
    })
    expect(res.statusCode).toBe(404)
    await fastify.close()
  })

  it('lists published chatbots with url and iframe_src', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [chatbotRow({ status: 'published', publishedAt: '2026-01-02T00:00:00.000Z' })] })
    const fastify = await chatbotsFactory(preHook, adminEnv)
    const res = await fastify.inject({ method: 'GET', url: '/published' })
    expect(res.statusCode).toBe(200)
    const item = res.json().data[0]
    expect(item.status).toBe('published')
    expect(item.url).toBe('https://chat.chatsaas.local/chat-1')
    expect(item.iframe_src).toContain('<iframe src="https://chat.chatsaas.local/chat-1"')
    const scan = ddbMock.calls()[0]
    const publishedScanInput = scan.args[0].input as ScanCommand['input']
    expect(publishedScanInput.FilterExpression).toContain('#s = :published')
    await fastify.close()
  })
})

describe('WI-001 public chatbot routes', () => {
  it('returns config for a published chatbot', async () => {
    ddbMock.on(GetCommand).resolves({ Item: chatbotRow({ status: 'published' }) })
    const fastify = await chatbotsPublicFactory({ chatbotsTable: 'chatbots-tbl' })
    const res = await fastify.inject({ method: 'GET', url: '/chat-1/config' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      success: true,
      data: { chatbotId: 'chat-1', name: 'Support Bot', status: 'published', expires_at: null },
    })
    await fastify.close()
  })

  it('returns 404 for a draft chatbot config (no leak)', async () => {
    ddbMock.on(GetCommand).resolves({ Item: chatbotRow({ status: 'draft' }) })
    const fastify = await chatbotsPublicFactory({ chatbotsTable: 'chatbots-tbl' })
    const res = await fastify.inject({ method: 'GET', url: '/chat-1/config' })
    expect(res.statusCode).toBe(404)
    await fastify.close()
  })

  it('returns 404 for an archived chatbot config', async () => {
    ddbMock.on(GetCommand).resolves({ Item: chatbotRow({ status: 'archived' }) })
    const fastify = await chatbotsPublicFactory({ chatbotsTable: 'chatbots-tbl' })
    const res = await fastify.inject({ method: 'GET', url: '/chat-1/config' })
    expect(res.statusCode).toBe(404)
    await fastify.close()
  })

  it('returns 404 for a missing chatbot iframe', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined })
    const fastify = await chatbotsPublicFactory({ chatbotsTable: 'chatbots-tbl' })
    const res = await fastify.inject({ method: 'GET', url: '/chat-MISSING/iframe' })
    expect(res.statusCode).toBe(404)
    await fastify.close()
  })

  it('returns iframe snippet for a published chatbot', async () => {
    process.env.PUBLIC_CHAT_BASE_URL = 'https://chat.example.com'
    ddbMock.on(GetCommand).resolves({ Item: chatbotRow({ status: 'published' }) })
    const fastify = await chatbotsPublicFactory({ chatbotsTable: 'chatbots-tbl' })
    const res = await fastify.inject({ method: 'GET', url: '/chat-1/iframe' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      success: true,
      data: {
        iframe_src: '<iframe src="https://chat.example.com/chat-1" width="100%" height="600" frameborder="0"></iframe>',
        expires_at: null,
      },
    })
    await fastify.close()
  })

  it('returns 404 for a draft chatbot iframe', async () => {
    ddbMock.on(GetCommand).resolves({ Item: chatbotRow({ status: 'draft' }) })
    const fastify = await chatbotsPublicFactory({ chatbotsTable: 'chatbots-tbl' })
    const res = await fastify.inject({ method: 'GET', url: '/chat-1/iframe' })
    expect(res.statusCode).toBe(404)
    await fastify.close()
  })
})
