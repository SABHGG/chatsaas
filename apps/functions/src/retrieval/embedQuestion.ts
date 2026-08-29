import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { withBackoff } from './backoff.js'
import { RetrievalError } from './types.js'

/**
 * Embeds the visitor's question with Bedrock Titan v2 (1024 dims) — the
 * SAME model family as WI-005 ingest so the vectors live in the same space.
 * Model id from env `BEDROCK_EMBED_MODEL_ID`.
 *
 * R-3: bounded exponential backoff with jitter on `ThrottlingException`
 * (shared helper in `./backoff.ts`); Validation/AccessDenied fail fast.
 */
export interface EmbedQuestionInput {
  question: string
  modelId: string
  region: string
}

/** Titan v2 output dimensionality. */
export const TITAN_V2_DIMS = 1024

export async function embedQuestion(
  input: EmbedQuestionInput,
  bedrock?: BedrockRuntimeClient,
): Promise<number[]> {
  const client = bedrock ?? new BedrockRuntimeClient({ region: input.region })
  const body = JSON.stringify({ inputText: input.question })

  try {
    return await withBackoff(async () => {
    const resp = await client.send(
      new InvokeModelCommand({
        modelId: input.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body,
      }),
    )
    const json = JSON.parse(
      new TextDecoder('utf-8').decode(resp.body as Uint8Array),
    ) as { embedding?: number[] }
    if (!Array.isArray(json.embedding)) {
      throw new RetrievalError('bedrock_validation', 'Titan v2 response missing embedding array')
    }
    return json.embedding
    })
  } catch (err) {
    const name = (err as { name?: string })?.name
    if (name === 'ValidationException') {
      throw new RetrievalError('bedrock_validation', `Titan v2 rejected the request: ${(err as Error).message}`)
    }
    if (name === 'AccessDeniedException') {
      throw new RetrievalError('bedrock_access_denied', `Bedrock access denied for ${input.modelId}`)
    }
    throw err
  }
}
