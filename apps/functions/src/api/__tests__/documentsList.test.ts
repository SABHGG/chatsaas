import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb'
import { documentsListFactory } from '../documentsList'
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

beforeEach(() => {
  ddbMock.reset()
  process.env.AWS_REGION = 'us-east-1'
})

describe('documentsList', () => {
  it('returns 401 when the preHook does not set claims', async () => {
    const noClaims: UserPreHook = async () => undefined
    const fastify = await documentsListFactory(noClaims, {
      documentsTable: 'docs-tbl',
      chatbotsTable: 'chatbots-tbl',
    })
    const res = await fastify.inject({ method: 'GET', url: '/chat-1/documents' })
    expect(res.statusCode).toBe(401)
    await fastify.close()
  })

  it('returns 404 when chatbot does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined })
    const fastify = await documentsListFactory(preHook, {
      documentsTable: 'docs-tbl',
      chatbotsTable: 'chatbots-tbl',
    })
    const res = await fastify.inject({ method: 'GET', url: '/chat-NONEXIST/documents' })
    expect(res.statusCode).toBe(404)
    await fastify.close()
  })

  it('returns 403 when chatbot belongs to another company (cross-tenant)', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'chat-OTHER', companyId: 'company-OTHER' },
    })
    const fastify = await documentsListFactory(preHook, {
      documentsTable: 'docs-tbl',
      chatbotsTable: 'chatbots-tbl',
    })
    const res = await fastify.inject({ method: 'GET', url: '/chat-OTHER/documents' })
    expect(res.statusCode).toBe(403)
    await fastify.close()
  })

  it('returns the documents filtered by chatbot and company', async () => {
    // Chatbot ownership check passes
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'chat-1', companyId: 'company-acme' },
    })
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          id: 'doc-1',
          chatbotId: 'chat-1',
          companyId: 'company-acme',
          ownerSub: 'user-1',
          filename: 'a.pdf',
          mimeType: 'application/pdf',
          byteCount: 10,
          status: 'ready',
          s3Key: 'k1',
          metadata: {},
          createdAt: '2026-02-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z',
        },
        {
          id: 'doc-2',
          chatbotId: 'chat-1',
          companyId: 'company-acme',
          ownerSub: 'user-1',
          filename: 'b.pdf',
          mimeType: 'application/pdf',
          byteCount: 20,
          status: 'uploaded',
          s3Key: 'k2',
          metadata: {},
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    const fastify = await documentsListFactory(preHook, {
      documentsTable: 'docs-tbl',
      chatbotsTable: 'chatbots-tbl',
    })
    const res = await fastify.inject({ method: 'GET', url: '/chat-1/documents' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.documents.length).toBe(2)
    // Sorted newest first.
    expect(body.data.documents[0].id).toBe('doc-1')
    await fastify.close()
  })

  it('returns an empty list when there are no documents', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'chat-1', companyId: 'company-acme' },
    })
    ddbMock.on(ScanCommand).resolves({ Items: [] })
    const fastify = await documentsListFactory(preHook, {
      documentsTable: 'docs-tbl',
      chatbotsTable: 'chatbots-tbl',
    })
    const res = await fastify.inject({ method: 'GET', url: '/chat-1/documents' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.documents).toEqual([])
    await fastify.close()
  })
})

// Suppress unused-import warnings for vi.
void vi