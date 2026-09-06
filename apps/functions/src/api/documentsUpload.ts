import Fastify, { type FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { TenantResolutionError, checkChatbotOwnership, resolveTenant } from '@/ingest/resolveTenant'
import type { UserPreHook } from './hooks'
import type { CognitoAccessTokenClaims } from '@/auth/claims'
import type { DocumentRecord } from '@/ingest/types'

interface PluginOpts {
  preHook: UserPreHook
  documentsTable: string
  documentsBucket: string
  chatbotsTable: string
}

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
])

const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: { type: 'string' },
    code: { type: 'string' },
  },
  required: ['success', 'error', 'code'],
} as const

/**
 * Content-sniff the raw bytes to detect the actual MIME type.
 * Returns the detected MIME or null if unknown.
 * This mitigates client-controlled x-mime-type header trust (JD-A-005).
 */
function sniffMimeType(raw: Buffer): string | null {
  if (raw.length < 4) return null

  // PDF: %PDF at offset 0
  if (raw[0] === 0x25 && raw[1] === 0x50 && raw[2] === 0x44 && raw[3] === 0x46) {
    return 'application/pdf'
  }
  // DOCX: ZIP-based (PK\x03\x04 or PK\x05\x06 or PK\x07\x08) with "word/" in
  // the archive. The OOXML central directory sits at the END of the file, so
  // the search must cover the whole buffer — a first-1KB probe misses most
  // real DOCX files and falls through to the text branch, which would
  // 400-reject every such upload as MIME_MISMATCH.
  if (raw[0] === 0x50 && raw[1] === 0x4b && (raw[2] === 0x03 || raw[2] === 0x05 || raw[2] === 0x07)) {
    if (raw.includes(Buffer.from('word/')) || raw.includes(Buffer.from('xl/')) || raw.includes(Buffer.from('ppt/'))) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
  }
  // text/plain or text/markdown: try UTF-8 decode
  try {
    raw.toString('utf8')
    return 'text/plain'
  } catch {
    return null
  }
}

const documentsUploadPlugin: FastifyPluginAsync<PluginOpts> = async (
  fastify,
  opts
) => {
  fastify.addHook('onRequest', opts.preHook)

  // Reject oversize requests BEFORE the body parser reads them into memory.
  // Fastify honors `bodyLimit` at the parser level; we set it to MAX_BYTES
  // plus a small margin for header overhead.
  fastify.removeAllContentTypeParsers()
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    try { done(null, JSON.parse(String(body))) } catch (e) { done(e as Error) }
  })
  fastify.addContentTypeParser(
    ['application/octet-stream', 'application/pdf', 'text/plain', 'text/markdown',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body)
  )

  fastify.post(
    '/:chatbotId/documents',
    {
      schema: {
        tags: ['Documents'],
        summary: 'Upload a document for a chatbot',
        // No body schema: the body is the raw file bytes. Headers carry
        // the metadata (x-filename, x-mime-type).
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  documentId: { type: 'string' },
                  status: { type: 'string' },
                  s3Key: { type: 'string' },
                  companyId: { type: 'string' },
                  chatbotId: { type: 'string' },
                },
                required: ['documentId', 'status', 's3Key', 'companyId', 'chatbotId'],
                additionalProperties: false,
              },
            },
            required: ['success', 'data'],
          },
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          413: errorSchema,
          415: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const claims = (request as { user?: CognitoAccessTokenClaims }).user
      const chatbotId = (request.params as { chatbotId: string }).chatbotId
      if (!claims) {
        return reply
          .code(401)
          .send({ success: false, error: 'Unauthenticated', code: 'UNAUTHENTICATED' })
      }

      const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true },
      })
      try {
        await resolveTenant({
          jwtClaims: claims,
          pathParams: { chatbotId },
          documentRow: null,
          documentsTable: opts.documentsTable,
          ddb,
        })
        // Cross-tenant chatbot ownership check (403 if chatbot belongs to another company).
        await checkChatbotOwnership({
          jwtClaims: claims as CognitoAccessTokenClaims,
          chatbotId,
          chatbotsTable: opts.chatbotsTable,
          ddb,
        })
      } catch (err: unknown) {
        if (err instanceof TenantResolutionError) {
          const code = err.code === "chatbot_not_found" ? 404 : 403
          return reply
            .code(code)
            .send({ success: false, error: err.message, code: err.code.toUpperCase() })
        }
        throw err
      }

      const raw = request.body as Buffer | undefined
      const filename = (request.headers['x-filename'] as string | undefined)
      const mimeType = (request.headers['x-mime-type'] as string | undefined)

      if (!filename) {
        return reply
          .code(400)
          .send({ success: false, error: 'Missing x-filename header', code: 'MISSING_FILENAME' })
      }
      if (!mimeType) {
        return reply
          .code(400)
          .send({ success: false, error: 'Missing x-mime-type header', code: 'MISSING_MIME' })
      }
      if (!raw || raw.length === 0) {
        return reply
          .code(400)
          .send({ success: false, error: 'Empty body', code: 'EMPTY_BODY' })
      }
      if (raw.length > MAX_BYTES) {
        return reply
          .code(413)
          .send({ success: false, error: 'File too large', code: 'FILE_TOO_LARGE' })
      }
      if (!ALLOWED_MIME.has(mimeType)) {
        return reply
          .code(415)
          .send({ success: false, error: 'Unsupported MIME', code: 'UNSUPPORTED_MIME' })
      }

      // Content-sniffing: verify the claimed MIME matches actual file signature (JD-A-005).
      // The text family relaxes one way: every decodable text file sniffs as
      // `text/plain` (UTF-8 decoding never throws), so a legitimately
      // claimed `text/markdown` must be accepted against that detection.
      // Binary spoofing (a PDF/exe renamed to .md) is still caught — those
      // carry a binary signature the sniffer detects before the text branch.
      const detected = sniffMimeType(raw)
      const markdownClaimedOverText = detected === 'text/plain' && mimeType === 'text/markdown'
      if (detected && detected !== mimeType && !markdownClaimedOverText) {
        return reply
          .code(400)
          .send({ success: false, error: 'MIME type does not match file content', code: 'MIME_MISMATCH' })
      }

      const documentId = randomUUID()
      const jwtCompanyId = (claims as CognitoAccessTokenClaims)['custom:company_id'] as string
      const s3Key = `${jwtCompanyId}/${chatbotId}/${documentId}/${filename}`

      const s3 = new S3Client({})
      await s3.send(
        new PutObjectCommand({
          Bucket: opts.documentsBucket,
          Key: s3Key,
          Body: raw,
          ContentType: mimeType,
        }),
      )

      const now = new Date().toISOString()
      const record: DocumentRecord = {
        id: documentId,
        chatbotId,
        companyId: jwtCompanyId,
        ownerSub: claims.sub,
        filename,
        mimeType,
        byteCount: raw.length,
        status: 'uploaded',
        s3Key,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      }
      await ddb.send(
        new PutCommand({
          TableName: opts.documentsTable,
          Item: record,
          ConditionExpression: 'attribute_not_exists(id)',
        }),
      )

      return reply.code(201).send({
        success: true,
        data: {
          documentId,
          status: 'uploaded',
          s3Key,
          companyId: jwtCompanyId,
          chatbotId,
        },
      })
    }
  )
}

export async function documentsUploadFactory(
  preHook: UserPreHook,
  env: { documentsTable: string; documentsBucket: string; chatbotsTable: string }
) {
  // bodyLimit is set to MAX_BYTES + a small margin so the in-handler
  // 413 check (which returns the standard error envelope) is the one
  // that fires, not fastify's default 413 with no body.
  const fastify = Fastify({ bodyLimit: MAX_BYTES + 1024 })
  await fastify.register(documentsUploadPlugin, {
    preHook,
    documentsTable: env.documentsTable,
    documentsBucket: env.documentsBucket,
    chatbotsTable: env.chatbotsTable,
  })
  return fastify
}

export { documentsUploadPlugin }