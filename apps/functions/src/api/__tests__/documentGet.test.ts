import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { documentGetFactory } from '../documentGet'
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

describe('documentGet', () => {
  it('returns 404 when the document does not exist', async () => {
    ddbMock.on(GetCommand).resolves({})
    const fastify = await documentGetFactory(preHook, { documentsTable: 'docs-tbl' })
    const res = await fastify.inject({ method: 'GET', url: '/doc-1' })
    expect(res.statusCode).toBe(404)
    await fastify.close()
  })

  it('returns the document when the JWT matches the row tenant', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
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
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    })
    const fastify = await documentGetFactory(preHook, { documentsTable: 'docs-tbl' })
    const res = await fastify.inject({ method: 'GET', url: '/doc-1' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.id).toBe('doc-1')
    await fastify.close()
  })

  it('returns 403 when the document belongs to a different company', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        id: 'doc-1',
        chatbotId: 'chat-1',
        companyId: 'company-OTHER', // <-- different
        ownerSub: 'user-1',
        filename: 'a.pdf',
        mimeType: 'application/pdf',
        byteCount: 10,
        status: 'ready',
        s3Key: 'k1',
        metadata: {},
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    })
    const fastify = await documentGetFactory(preHook, { documentsTable: 'docs-tbl' })
    const res = await fastify.inject({ method: 'GET', url: '/doc-1' })
    expect(res.statusCode).toBe(403)
    await fastify.close()
  })
})

// Suppress unused-import warnings for vi.
void vi
