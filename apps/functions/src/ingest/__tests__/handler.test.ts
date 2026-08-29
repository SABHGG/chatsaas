import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { makeHandler, type IngestHandlerConfig, type IngestHandlerDeps } from '../handler'
import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'

const ddbMock = mockClient(DynamoDBDocumentClient)
const s3Mock = mockClient(S3Client)
const sqsMock = mockClient(SQSClient)

const cfg: IngestHandlerConfig = {
  documentsBucket: 'docs',
  documentsTable: 'docs-tbl',
  dbClusterArn: 'arn:aws:rds:us-east-1:1:cluster:c',
  dbSecretArn: 'arn:aws:secretsmanager:us-east-1:1:secret:s',
  dbName: 'chatsaas',
  bedrockRegion: 'us-east-1',
  bedrockEmbedModelId: 'amazon.titan-embed-text-v2:0',
  ingestDlqUrl: 'https://sqs.us-east-1.amazonaws.com/1/dlq',
  chunkSize: 1000,
  chunkOverlap: 200,
}

const splitText = vi.fn((content: string) => [
  { index: 0, content, contentSha256: new Uint8Array(32) },
])
const embedChunks = vi.fn(async () => [[0.1, 0.2, 0.3]])
const persistChunks = vi.fn(async () => ({ insertedCount: 1 }))
const parsePdf = vi.fn(async () => ['hello world'])
const parseDocx = vi.fn(async () => 'docx text')
const parseText = vi.fn((buf: Buffer) => buf.toString('utf8'))

const deps: IngestHandlerDeps = {
  ddb: ddbMock as unknown as DynamoDBDocumentClient,
  s3: s3Mock as unknown as S3Client,
  sqs: sqsMock as unknown as SQSClient,
  parsePdf,
  parseDocx,
  parseText,
  splitText,
  embedChunks,
  persistChunks,
}

beforeEach(() => {
  ddbMock.reset()
  s3Mock.reset()
  sqsMock.reset()
  splitText.mockClear()
  embedChunks.mockClear()
  persistChunks.mockClear()
  parsePdf.mockClear()
  parseDocx.mockClear()
  parseText.mockClear()
})

function makeEvent(key: string) {
  return {
    Records: [
      {
        eventVersion: '2.1',
        eventSource: 'aws.s3',
        eventName: 'ObjectCreated:Put',
        s3: { bucket: { name: 'docs' }, object: { key, size: 100 } },
      },
    ],
  }
}

const docRow = {
  id: 'doc-1',
  chatbotId: 'chat-1',
  companyId: 'company-acme',
  ownerSub: 'user-1',
  filename: 'hello.txt',
  mimeType: 'text/plain',
  byteCount: 11,
  status: 'uploaded' as const,
  s3Key: 'company-acme/chat-1/doc-1/hello.txt',
  metadata: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('ingest handler — happy path', () => {
  it('parses → splits → embeds → persists → marks ready', async () => {
    ddbMock.on(GetCommand).resolves({ Item: docRow })
    ddbMock.on(UpdateCommand).resolves({})
    s3Mock.on(GetObjectCommand).resolves({
      Body: Readable.from(Buffer.from('hello world', 'utf8')) as never,
    })
    sqsMock.on(SendMessageCommand).resolves({})

    const h = makeHandler(cfg, deps)
    await h(makeEvent('company-acme/chat-1/doc-1/hello.txt'))

    expect(parseText).toHaveBeenCalledOnce()
    expect(splitText).toHaveBeenCalledOnce()
    expect(embedChunks).toHaveBeenCalledOnce()
    expect(persistChunks).toHaveBeenCalledOnce()
    // We should have seen one transition to processing and one to ready.
    const updates = ddbMock.commandCalls(UpdateCommand)
    expect(updates.length).toBe(2)
  })
})

describe('ingest handler — skip cases', () => {
  it('skips records whose key has fewer than 4 segments', async () => {
    const h = makeHandler(cfg, deps)
    await h(makeEvent('bad/key'))
    expect(ddbMock.commandCalls(GetCommand)).toHaveLength(0)
    expect(embedChunks).not.toHaveBeenCalled()
  })

  it('skips when the document row is missing', async () => {
    ddbMock.on(GetCommand).resolves({})
    const h = makeHandler(cfg, deps)
    await h(makeEvent('company-acme/chat-1/doc-missing/hello.txt'))
    expect(embedChunks).not.toHaveBeenCalled()
  })

  it('skips when the S3 key does not match the row tenant', async () => {
    ddbMock.on(GetCommand).resolves({ Item: docRow })
    const h = makeHandler(cfg, deps)
    await h(makeEvent('company-OTHER/chat-1/doc-1/hello.txt'))
    expect(embedChunks).not.toHaveBeenCalled()
  })
})

describe('ingest handler — failure', () => {
  it('marks the document failed and pushes to the DLQ and writes S3 marker file when parsing throws', async () => {
    ddbMock.on(GetCommand).resolves({ Item: docRow })
    ddbMock.on(UpdateCommand).resolves({})
    s3Mock.on(GetObjectCommand).resolves({
      Body: Readable.from(Buffer.from('whatever', 'utf8')) as never,
    })
    s3Mock.on(PutObjectCommand).resolves({})
    parseText.mockImplementationOnce(() => {
      throw new Error('parse fail')
    })
    sqsMock.on(SendMessageCommand).resolves({})

    const h = makeHandler(cfg, deps)
    await expect(
      h(makeEvent('company-acme/chat-1/doc-1/hello.txt')),
    ).rejects.toThrow(/parse fail/)

    expect(sqsMock.commandCalls(SendMessageCommand).length).toBe(1)
    // Assert S3 marker file is written (JD-A-010)
    const putCalls = s3Mock.commandCalls(PutObjectCommand)
    expect(putCalls.length).toBe(1)
    const putReq = putCalls[0].args[0].input
    expect(putReq.Key).toBe('_failed/doc-1/error.json')
    expect(putReq.Bucket).toBe('docs')
    const markerBody = JSON.parse(String(putReq.Body))
    expect(markerBody.documentId).toBe('doc-1')
    expect(markerBody.errorClass).toBe('Error')
  })
})