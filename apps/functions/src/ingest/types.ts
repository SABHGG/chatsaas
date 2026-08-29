/**
 * Ingest pipeline types. Pure types module — no runtime code.
 *
 * The Document row lives in DynamoDB; the embedding rows live in
 * `public.embeddings` in Aurora. This module is the contract between
 * the admin route, the IngestLambda handler, and the Operator's Board.
 */

export type DocumentStatus = "uploaded" | "processing" | "ready" | "failed";

export interface IngestErrorMetadata {
  errorClass: string;
  message: string;
  failedAt: string;
}

export interface IngestSuccessMetadata {
  chunkCount: number;
  modelId: string;
  totalLatencyMs: number;
  contentSha256: string;
  emptyChunkCount: number;
  completedAt: string;
}

export interface DocumentRecord {
  id: string;
  chatbotId: string;
  companyId: string;
  ownerSub: string;
  filename: string;
  mimeType: string;
  byteCount: number;
  status: DocumentStatus;
  s3Key: string;
  metadata: {
    ingest?: IngestSuccessMetadata;
    error?: IngestErrorMetadata;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * The S3 event shape we care about. The full S3 event has more fields
 * (https://docs.aws.amazon.com/AmazonS3/latest/userguide/event-notification-overview.html);
 * the IngestLambda reads only the bucket + key.
 */
export interface IngestS3Record {
  s3: {
    bucket: { name: string };
    object: { key: string };
  };
}

export interface IngestS3Event {
  Records: IngestS3Record[];
}

export interface Chunk {
  /** Zero-based index across the document. */
  index: number;
  content: string;
  /** SHA-256 of `content` (binary, 32 bytes). Used for idempotency. */
  contentSha256: Uint8Array;
}

/** One row to insert into public.embeddings. */
export interface EmbeddingRow {
  id: string;
  chatbotId: string;
  companyId: string;
  content: string;
  contentSha256: Uint8Array;
  embedding: number[];
}

export interface BedrockEmbeddingRequest {
  inputText: string;
}

export interface BedrockEmbeddingResponse {
  embedding: number[];
  inputTextTokenCount: number;
}

/**
 * Resolved tenant after `resolveTenant` has asserted ownership.
 * `documentId` is undefined on the upload path (Document row does not exist yet).
 */
export interface ResolvedTenant {
  sub: string;
  companyId: string;
  chatbotId: string;
  documentId?: string;
}

export class TenantResolutionError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "TenantResolutionError";
  }
}
