import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Buffer } from "node:buffer";
import { logger } from "./logger.js";
import { splitText } from "./splitter.js";
import { embedChunks } from "./embedBedrock.js";
import { persistChunks } from "./persistEmbeddings.js";
import { resolveNeonUrl } from "./neonUrl.js";
import { parsePdf } from "./parsePdf.js";
import { parseDocx } from "./parseDocx.js";
import { parseText } from "./parseText.js";
import type {
  DocumentRecord,
  IngestS3Event,
  IngestS3Record,
  EmbeddingRow,
  Chunk,
} from "./types.js";

/**
 * IngestLambda handler. Triggered by EventBridge on every
 * `s3:ObjectCreated:Put` against the documents bucket.
 *
 * Pipeline:
 *   1. Parse the S3 key into (companyId, chatbotId, documentId, filename).
 *   2. Load the Document row from DynamoDB.
 *   3. Validate the key against the row (tenant isolation).
 *   4. Update the row to `processing` (with a status guard so retries are no-ops).
 *   5. Get the object from S3.
 *   6. Pick the parser by mime type.
 *   7. Split into chunks.
 *   8. Embed via Bedrock Titan v2.
 *   9. Resolve the Neon URL (SSM SecureString) and persist via the Neon HTTP
 *      driver with ON CONFLICT DO NOTHING.
 *  10. Update the row to `ready` with metadata.
 *  11. On terminal failure: update to `failed`, push to DLQ, write a marker file.
 */

export interface IngestHandlerConfig {
  documentsBucket: string
  documentsTable: string
  /** SSM SecureString parameter holding the pooled Neon connection string. */
  neonUrlParameterName: string
  bedrockRegion: string
  bedrockEmbedModelId: string
  ingestDlqUrl?: string
  chunkSize?: number
  chunkOverlap?: number
}

export interface IngestHandlerDeps {
  ddb: DynamoDBDocumentClient
  s3: S3Client
  sqs: SQSClient
  parsePdf: (buffer: Buffer) => Promise<string[]>
  parseDocx: (buffer: Buffer) => Promise<string>
  parseText: (buffer: Buffer, mime: string) => string
  splitText: typeof splitText
  embedChunks: typeof embedChunks
  persistChunks: typeof persistChunks
  resolveNeonUrl: typeof resolveNeonUrl
}

function readEnvConfig(): IngestHandlerConfig {
  const required = (name: string): string => {
    const v = process.env[name]
    if (!v) {
      throw new Error(`Missing required env var: ${name}`)
    }
    return v
  }
  return {
    documentsBucket: required("DOCUMENTS_BUCKET"),
    documentsTable: required("DOCUMENTS_TABLE"),
    neonUrlParameterName: required("NEON_URL_PARAMETER_NAME"),
    bedrockRegion: required("BEDROCK_REGION"),
    bedrockEmbedModelId: required("BEDROCK_EMBED_MODEL_ID"),
    ingestDlqUrl: process.env.INGEST_DLQ_URL,
    chunkSize: Number(process.env.CHUNK_SIZE ?? "1000"),
    chunkOverlap: Number(process.env.CHUNK_OVERLAP ?? "200"),
  }
}

const defaultDeps = (): IngestHandlerDeps => ({
  ddb: DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  }),
  s3: new S3Client({}),
  sqs: new SQSClient({}),
  parsePdf,
  parseDocx,
  parseText,
  splitText,
  embedChunks,
  persistChunks,
  resolveNeonUrl,
})

/**
 * Build a handler with the given config and dependencies. Production code
 * calls this with no args; tests pass mocks.
 */
export function makeHandler(
  config: IngestHandlerConfig = readEnvConfig(),
  deps: IngestHandlerDeps = defaultDeps(),
) {
  const chunkSize = config.chunkSize ?? 1000
  const chunkOverlap = config.chunkOverlap ?? 200
  return async (event: IngestS3Event): Promise<void> => {
    for (const record of event.Records ?? []) {
      try {
        await processRecord(record, config, deps, chunkSize, chunkOverlap)
      } catch (err) {
        logger.error("ingest:record:failed", {
          error_class: (err as { name?: string })?.name ?? "Error",
          message: (err as { message?: string })?.message,
        })
        // Re-throw so the EventBridge target DLQ catches the failure.
        throw err
      }
    }
  }
}

async function processRecord(
  record: IngestS3Record,
  config: IngestHandlerConfig,
  deps: IngestHandlerDeps,
  chunkSize: number,
  chunkOverlap: number,
): Promise<void> {
  const bucket = record.s3.bucket.name
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "))
  const keyParts = key.split("/")
  // expected: <companyId>/<chatbotId>/<documentId>/<filename>
  if (keyParts.length < 4) {
    logger.info("ingest:key:skipping", { key, reason: "shape" })
    return
  }
  const [companyId, chatbotId, documentId] = keyParts

  const doc = await loadDocument(deps, config.documentsTable, documentId)
  if (!doc) {
    logger.info("ingest:document:missing", { document_id: documentId })
    return
  }
  if (doc.companyId !== companyId || doc.chatbotId !== chatbotId) {
    logger.warn("ingest:key:tenant-mismatch", {
      document_id: documentId,
      jwt_company_id: doc.companyId,
      s3_company_id: companyId,
    })
    return
  }
  const t0 = Date.now()
  await transitionTo(deps, config.documentsTable, documentId)

  try {
    const s3resp = await deps.s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    )
    const buffer = await streamToBuffer(
      s3resp.Body as ReadableStream | NodeJS.ReadableStream,
    )
    const content = await pickParser(deps, buffer, doc.mimeType)
    const chunks = deps.splitText(content, { chunkSize, chunkOverlap })
    const emptyChunkCount = chunks.filter((c) => c.content.trim() === "").length
    const vectors = await deps.embedChunks(chunks, {
      modelId: config.bedrockEmbedModelId,
      region: config.bedrockRegion,
    })
    const rows: EmbeddingRow[] = chunks.map((c, i) => ({
      chatbotId: doc.chatbotId,
      companyId: doc.companyId,
      content: c.content,
      contentSha256: c.contentSha256,
      embedding: vectors[i],
    }))
    const neonUrl = await deps.resolveNeonUrl(config.neonUrlParameterName)
    const { insertedCount } = await deps.persistChunks({ neonUrl }, rows)
    const totalLatencyMs = Date.now() - t0
    const topSha = chunks.length > 0 ? toHex(chunks[0].contentSha256) : ""
    await markReady(deps, config.documentsTable, documentId, {
      chunkCount: chunks.length,
      modelId: config.bedrockEmbedModelId,
      totalLatencyMs,
      contentSha256: topSha,
      emptyChunkCount,
      completedAt: new Date().toISOString(),
    })
    logger.info("ingest:document:ready", {
      document_id: documentId,
      chatbot_id: chatbotId,
      company_id: companyId,
      chunk_count: chunks.length,
      inserted_count: insertedCount,
      latency_ms: totalLatencyMs,
      embedding_model_id: config.bedrockEmbedModelId,
    })
  } catch (err) {
    const errorClass = (err as { name?: string })?.name ?? "Error"
    const message = (err as { message?: string })?.message ?? String(err)
    await markFailed(deps, config.documentsTable, documentId, {
      errorClass,
      message,
      failedAt: new Date().toISOString(),
    })
    if (config.ingestDlqUrl) {
      await deps.sqs
        .send(
          new SendMessageCommand({
            QueueUrl: config.ingestDlqUrl,
            MessageBody: JSON.stringify({
              documentId,
              chatbotId,
              companyId,
              errorClass,
              message,
            }),
          }),
        )
        .catch((dlqErr) =>
          logger.error("ingest:dlq:send-failed", {
            document_id: documentId,
            error_class: (dlqErr as { name?: string })?.name ?? "Error",
          }),
        )
    }
    logger.error("ingest:document:failed", {
      document_id: documentId,
      error_class: errorClass,
      latency_ms: Date.now() - t0,
    })
    // Write S3 marker file for human inspection (per AC-8 / OpenSpec).
    const markerKey = `_failed/${documentId}/error.json`
    await deps.s3
      .send(
        new PutObjectCommand({
          Bucket: config.documentsBucket,
          Key: markerKey,
          Body: JSON.stringify({
            documentId,
            chatbotId,
            companyId,
            errorClass,
            message,
            failedAt: new Date().toISOString(),
          }),
          ContentType: "application/json",
        }),
      )
      .catch((s3Err) =>
        logger.error("ingest:marker:s3-failed", {
          document_id: documentId,
          marker_key: markerKey,
          error_class: (s3Err as { name?: string })?.name ?? "Error",
        }),
      )
    throw err
  }
}

async function loadDocument(
  deps: IngestHandlerDeps,
  table: string,
  id: string,
): Promise<DocumentRecord | null> {
  const out = await deps.ddb.send(
    new GetCommand({ TableName: table, Key: { id } }),
  )
  return (out.Item as DocumentRecord | undefined) ?? null
}

async function transitionTo(
  deps: IngestHandlerDeps,
  table: string,
  id: string,
): Promise<void> {
  await deps.ddb.send(
    new UpdateCommand({
      TableName: table,
      Key: { id },
      ConditionExpression: "#s IN (:uploaded, :processing)",
      UpdateExpression: "SET #s = :processing, updatedAt = :now",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":uploaded": "uploaded",
        ":processing": "processing",
        ":now": new Date().toISOString(),
      },
    }),
  )
}

async function markReady(
  deps: IngestHandlerDeps,
  table: string,
  id: string,
  meta: NonNullable<DocumentRecord["metadata"]["ingest"]>,
): Promise<void> {
  await deps.ddb.send(
    new UpdateCommand({
      TableName: table,
      Key: { id },
      UpdateExpression:
        "SET #s = :ready, updatedAt = :now, metadata = :meta",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":ready": "ready",
        ":now": new Date().toISOString(),
        ":meta": { ingest: meta },
      },
    }),
  )
}

async function markFailed(
  deps: IngestHandlerDeps,
  table: string,
  id: string,
  err: NonNullable<DocumentRecord["metadata"]["error"]>,
): Promise<void> {
  await deps.ddb.send(
    new UpdateCommand({
      TableName: table,
      Key: { id },
      UpdateExpression:
        "SET #s = :failed, updatedAt = :now, metadata = :err",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":failed": "failed",
        ":now": new Date().toISOString(),
        ":err": { error: err },
      },
    }),
  )
}

async function pickParser(
  deps: IngestHandlerDeps,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (mimeType === "application/pdf") {
    const pages = await deps.parsePdf(buffer)
    return pages.filter((p) => p.length > 0).join("\n\n")
  }
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return deps.parseDocx(buffer)
  }
  return deps.parseText(buffer, mimeType)
}

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex")
}

async function streamToBuffer(
  stream: ReadableStream | NodeJS.ReadableStream,
): Promise<Buffer> {
  // Web stream (what S3 returns in Node 20) vs Node stream.
  if ("getReader" in stream) {
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    return Buffer.concat(chunks)
  }
  const chunks: Buffer[] = []
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

// Default export for Lambda entry point. Built lazily so the env-var check
// runs at first invocation, not at module load (which would break unit
// tests that import the module without setting env).
let _handler: ((event: IngestS3Event) => Promise<void>) | null = null
export function getHandler() {
  if (!_handler) {
    _handler = makeHandler()
  }
  return _handler
}
/**
 * Lambda handler — `index.ts` calls `await getHandler()(event)`.
 */
export async function handler(event: IngestS3Event): Promise<void> {
  return getHandler()(event)
}

// Suppress unused-import warnings for types only referenced in JSDoc.
void (null as unknown as Chunk | DocumentRecord | IngestS3Record)
