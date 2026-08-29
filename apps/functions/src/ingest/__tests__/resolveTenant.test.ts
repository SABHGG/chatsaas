import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import {
  resolveTenant,
  loadDocument,
} from '../resolveTenant'
import { TenantResolutionError } from '../types'
import type { CognitoAccessTokenClaims } from '../../auth/claims'

const ddbMock = mockClient(DynamoDBDocumentClient)

function makeClaims(over: Partial<CognitoAccessTokenClaims> = {}): CognitoAccessTokenClaims {
  return {
    sub: 'user-1',
    iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx',
    aud: 'client-id',
    exp: 1_000_000_000,
    iat: 999_000_000,
    token_use: 'access',
    'custom:company_id': 'company-acme',
    ...over,
  } as CognitoAccessTokenClaims
}

beforeEach(() => {
  ddbMock.reset()
})

describe('resolveTenant', () => {
  it('returns the JWT-claimed tenant on the upload path', async () => {
    const claims = makeClaims()
    const out = await resolveTenant({
      jwtClaims: claims,
      pathParams: { chatbotId: 'chat-1' },
      documentRow: null,
      documentsTable: 'docs',
      ddb: ddbMock as unknown as DynamoDBDocumentClient,
    })
    expect(out.sub).toBe('user-1')
    expect(out.companyId).toBe('company-acme')
    expect(out.chatbotId).toBe('chat-1')
  })

  it('throws when JWT lacks custom:company_id', async () => {
    const claims = makeClaims({ 'custom:company_id': undefined })
    await expect(
      resolveTenant({
        jwtClaims: claims,
        pathParams: { chatbotId: 'chat-1' },
        documentRow: null,
        documentsTable: 'docs',
        ddb: ddbMock as unknown as DynamoDBDocumentClient,
      })
    ).rejects.toBeInstanceOf(TenantResolutionError)
  })

  it('throws when JWT lacks sub', async () => {
    const claims = makeClaims({ sub: '' })
    await expect(
      resolveTenant({
        jwtClaims: claims,
        pathParams: { chatbotId: 'chat-1' },
        documentRow: null,
        documentsTable: 'docs',
        ddb: ddbMock as unknown as DynamoDBDocumentClient,
      })
    ).rejects.toBeInstanceOf(TenantResolutionError)
  })

  it('rejects when the document row points to a different chatbot', async () => {
    const claims = makeClaims()
    const row = {
      id: 'doc-1',
      chatbotId: 'chat-OTHER',
      companyId: 'company-acme',
      ownerSub: 'user-1',
      filename: 'f.pdf',
      mimeType: 'application/pdf',
      byteCount: 10,
      status: 'uploaded' as const,
      s3Key: 'k',
      metadata: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    await expect(
      resolveTenant({
        jwtClaims: claims,
        pathParams: { chatbotId: 'chat-1' },
        documentRow: row,
        documentsTable: 'docs',
        ddb: ddbMock as unknown as DynamoDBDocumentClient,
      })
    ).rejects.toThrow(/chatbotId/)
  })

  it('rejects when the document row belongs to a different company', async () => {
    const claims = makeClaims()
    const row = {
      id: 'doc-1',
      chatbotId: 'chat-1',
      companyId: 'company-BETA', // <-- different
      ownerSub: 'user-1',
      filename: 'f.pdf',
      mimeType: 'application/pdf',
      byteCount: 10,
      status: 'uploaded' as const,
      s3Key: 'k',
      metadata: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    await expect(
      resolveTenant({
        jwtClaims: claims,
        pathParams: { chatbotId: 'chat-1' },
        documentRow: row,
        documentsTable: 'docs',
        ddb: ddbMock as unknown as DynamoDBDocumentClient,
      })
    ).rejects.toThrow(/companyId/)
  })

  it('returns the document id on the read path', async () => {
    const claims = makeClaims()
    const row = {
      id: 'doc-1',
      chatbotId: 'chat-1',
      companyId: 'company-acme',
      ownerSub: 'user-1',
      filename: 'f.pdf',
      mimeType: 'application/pdf',
      byteCount: 10,
      status: 'uploaded' as const,
      s3Key: 'k',
      metadata: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const out = await resolveTenant({
      jwtClaims: claims,
      pathParams: { chatbotId: 'chat-1' },
      documentRow: row,
      documentsTable: 'docs',
      ddb: ddbMock as unknown as DynamoDBDocumentClient,
    })
    expect(out.documentId).toBe('doc-1')
  })
})

describe('loadDocument', () => {
  it('returns the row when present', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'doc-1', chatbotId: 'chat-1' },
    })
    const out = await loadDocument(
      ddbMock as unknown as DynamoDBDocumentClient,
      'docs',
      'doc-1',
    )
    expect(out?.id).toBe('doc-1')
  })

  it('returns null when missing', async () => {
    ddbMock.on(GetCommand).resolves({})
    const out = await loadDocument(
      ddbMock as unknown as DynamoDBDocumentClient,
      'docs',
      'doc-1',
    )
    expect(out).toBeNull()
  })
})

// Suppress unused-import warnings for vi.
void vi
