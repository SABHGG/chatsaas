import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { documentsUploadFactory } from '../documentsUpload'
import type { UserPreHook } from '../hooks'
import type { CognitoAccessTokenClaims } from '../../auth/claims'

const ddbMock = mockClient(DynamoDBDocumentClient)
const s3Mock = mockClient(S3Client)

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
  s3Mock.reset()
  process.env.AWS_REGION = 'us-east-1'
})

// Helper: minimal valid PDF buffer
const PDF_MAGIC = Buffer.from('%PDF-1.4\n')

describe('documentsUpload', () => {
  it('rejects when body bytes exceed the 10 MB cap', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'chat-1', companyId: 'company-acme' },
    })
    const fastify = await documentsUploadFactory(preHook, {
      documentsBucket: 'docs',
      documentsTable: 'docs-tbl',
      chatbotsTable: 'chatbots-tbl',
    })
    // 10 MB + 1 byte, just over the cap.
    const buf = Buffer.alloc(10 * 1024 * 1024 + 1, 0x25) // % char for PDF magic
    const res = await fastify.inject({
      method: 'POST',
      url: '/chat-1/documents',
      headers: {
        'content-type': 'application/pdf',
        'x-filename': 'big.pdf',
        'x-mime-type': 'application/pdf',
      },
      payload: buf,
    })
    expect(res.statusCode).toBe(413)
    expect(JSON.parse(res.body).code).toBe('FILE_TOO_LARGE')
    await fastify.close()
  })

  it('rejects when x-filename is missing', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'chat-1', companyId: 'company-acme' },
    })
    const fastify = await documentsUploadFactory(preHook, {
      documentsBucket: 'docs',
      documentsTable: 'docs-tbl',
      chatbotsTable: 'chatbots-tbl',
    })
    const res = await fastify.inject({
      method: 'POST',
      url: '/chat-1/documents',
      headers: {
        'content-type': 'application/pdf',
        'x-mime-type': 'application/pdf',
      },
      payload: PDF_MAGIC,
    })
    expect(res.statusCode).toBe(400)
    await fastify.close()
  })

  it('rejects when mime type is not whitelisted', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'chat-1', companyId: 'company-acme' },
    })
    const fastify = await documentsUploadFactory(preHook, {
      documentsBucket: 'docs',
      documentsTable: 'docs-tbl',
      chatbotsTable: 'chatbots-tbl',
    })
    const res = await fastify.inject({
      method: 'POST',
      url: '/chat-1/documents',
      headers: {
        'content-type': 'application/octet-stream',
        'x-filename': 'malware.exe',
        'x-mime-type': 'application/octet-stream',
      },
      payload: PDF_MAGIC,
    })
    expect(res.statusCode).toBe(415)
    await fastify.close()
  })

  it('ignores embedded companyId in body bytes (spoofing resistance)', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'chat-1', companyId: 'company-acme' },
    })
    const fastify = await documentsUploadFactory(preHook, {
      documentsBucket: 'docs',
      documentsTable: 'docs-tbl',
      chatbotsTable: 'chatbots-tbl',
    })
    const buf = Buffer.concat([
      PDF_MAGIC,
      Buffer.from(JSON.stringify({ companyId: 'company-OTHER' })),
      Buffer.from('\r\n'),
      Buffer.from('hello'),
    ])
    const res = await fastify.inject({
      method: 'POST',
      url: '/chat-1/documents',
      headers: {
        'content-type': 'application/pdf',
        'x-filename': 'doc.pdf',
        'x-mime-type': 'application/pdf',
      },
      payload: buf,
    })
    // The body is treated as the file bytes; the embedded companyId is
    // ignored — the row's companyId is the JWT one.
    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body).data.companyId).toBe('company-acme')
    await fastify.close()
  })

  it('returns 401 when preHook does not set claims', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'chat-1', companyId: 'company-acme' },
    })
    const noClaims: UserPreHook = async () => undefined
    const fastify = await documentsUploadFactory(noClaims, {
      documentsBucket: 'docs',
      documentsTable: 'docs-tbl',
      chatbotsTable: 'chatbots-tbl',
    })
    const res = await fastify.inject({
      method: 'POST',
      url: '/chat-1/documents',
      headers: {
        'x-filename': 'test.pdf',
        'x-mime-type': 'application/pdf',
      },
      payload: PDF_MAGIC,
    })
    if (res.statusCode !== 401) {
      console.error('DEBUG 401 test - status:', res.statusCode, 'body:', res.body)
    }
    expect(res.statusCode).toBe(401)
    await fastify.close()
  })

  it('returns 403 when uploading to a chatbot owned by another company', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'chat-OTHER', companyId: 'company-OTHER' },
    })
    const fastify = await documentsUploadFactory(preHook, {
      documentsBucket: 'docs',
      documentsTable: 'docs-tbl',
      chatbotsTable: 'chatbots-tbl',
    })
    const res = await fastify.inject({
      method: 'POST',
      url: '/chat-OTHER/documents',
      headers: {
        'x-filename': 'test.pdf',
        'x-mime-type': 'application/pdf',
      },
      payload: PDF_MAGIC,
    })
    expect(res.statusCode).toBe(403)
    await fastify.close()
  })

  it('uploads to S3 and writes the Document row with the JWT companyId', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'chat-1', companyId: 'company-acme' },
    })
    ddbMock.on(PutCommand).resolves({})
    s3Mock.on(PutObjectCommand).resolves({})
    const fastify = await documentsUploadFactory(preHook, {
      documentsBucket: 'docs',
      documentsTable: 'docs-tbl',
      chatbotsTable: 'chatbots-tbl',
    })
    const res = await fastify.inject({
      method: 'POST',
      url: '/chat-1/documents',
      headers: {
        'content-type': 'application/pdf',
        'x-filename': 'doc.pdf',
        'x-mime-type': 'application/pdf',
      },
      payload: PDF_MAGIC,
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.data.companyId).toBe('company-acme')
    expect(body.data.chatbotId).toBe('chat-1')
    expect(body.data.status).toBe('uploaded')

    // The S3 key embeds the JWT-claimed company_id, not anything from the body.
    const s3Calls = s3Mock.commandCalls(PutObjectCommand)
    expect(s3Calls.length).toBe(1)
    const s3Req = s3Calls[0].args[0].input
    expect(String(s3Req.Key).startsWith('company-acme/chat-1/')).toBe(true)
    await fastify.close()
  })
})

// Suppress unused-import warnings for vi.
void vi