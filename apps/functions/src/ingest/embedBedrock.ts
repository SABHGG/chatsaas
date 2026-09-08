import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { Chunk, BedrockEmbeddingResponse } from "./types.js";
import { logger } from "./logger.js";

/**
 * Bedrock Titan v2 embedder. Accepts up to 25 chunks per `InvokeModel`
 * call (the API's batched-input limit). Batches internally so the caller
 * can pass any number of chunks.
 *
 * Bounded exponential backoff with jitter on `ThrottlingException`:
 * 5 attempts, base 200 ms, cap 5 s, ±20% jitter. Non-retryable errors
 * (Validation, AccessDenied) are rethrown.
 */
export interface EmbedOptions {
  modelId: string;
  region: string;
  maxBatchSize?: number;
}

const DEFAULT_BATCH = 25;
const RETRYABLE = new Set(["ThrottlingException", "ServiceUnavailableException", "TooManyRequestsException"]);
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 200;
const CAP_DELAY_MS = 5_000;

export async function embedChunks(
  chunks: Chunk[],
  opts: EmbedOptions,
): Promise<number[][]> {
  if (chunks.length === 0) {
    return [];
  }
  const client = new BedrockRuntimeClient({ region: opts.region });
  const batchSize = opts.maxBatchSize ?? DEFAULT_BATCH;
  const out: number[][] = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const vectors = await invokeWithRetry(client, batch, opts.modelId, opts.region);
    out.push(...vectors);
  }
  return out;
}

async function invokeWithRetry(
  client: BedrockRuntimeClient,
  batch: Chunk[],
  modelId: string,
  region: string,
): Promise<number[][]> {
  let lastError: unknown = undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // The Titan v2 batched-input shape is an array of {inputText: ...}.
      const body = JSON.stringify(batch.map((c) => ({ inputText: c.content })));
      const cmd = new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body,
      });
      const resp = await client.send(cmd);
      // Response body is a Uint8Array (streaming) of JSON.
      const json = JSON.parse(
        new TextDecoder("utf-8").decode(resp.body as Uint8Array),
      ) as BedrockEmbeddingResponse[] | BedrockEmbeddingResponse;
      // Titan v2 returns one of two shapes:
      //   - single-text: { embedding, inputTextTokenCount }
      //   - batched: [{ embedding, inputTextTokenCount }, ...]
      if (Array.isArray(json)) {
        return json.map((r) => r.embedding);
      }
      return [json.embedding];
    } catch (err) {
      lastError = err;
      const name = (err as { name?: string })?.name ?? "Error";
      if (!RETRYABLE.has(name) || attempt === MAX_ATTEMPTS) {
        logger.error("bedrock:embed:failed", {
          model_id: modelId,
          chunk_count: batch.length,
          attempt,
          error_class: name,
        });
        throw err;
      }
      const delay = Math.min(
        CAP_DELAY_MS,
        BASE_DELAY_MS * 2 ** (attempt - 1),
      );
      const jitter = delay * (1 + (Math.random() * 0.4 - 0.2));
      logger.warn("bedrock:embed:retrying", {
        model_id: modelId,
        chunk_count: batch.length,
        attempt,
        delay_ms: Math.round(jitter),
        error_class: name,
        region,
      });
      await sleep(jitter);
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
