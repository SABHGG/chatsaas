import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { withBackoff } from './backoff.js'
import { RetrievalError, type BedrockCompletion, type BuiltPrompt } from './types.js'

/**
 * Bedrock Claude 3.5 Sonnet completion (DC-006-1: deterministic model id,
 * no streaming, no LangChain — direct InvokeModel).
 *
 * R-3: ThrottlingException retried with jittered backoff (shared helper);
 * ValidationException / AccessDeniedException fail fast with typed errors.
 * R-8: exact `usage.input_tokens` / `usage.output_tokens` are parsed and
 * returned — never estimated.
 */
export interface CompleteInput {
  prompt: BuiltPrompt
  modelId: string
  region: string
  maxTokens: number
  temperature: number
}

interface ClaudeResponse {
  content?: Array<{ type?: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

const FAIL_FAST = new Set(['ValidationException', 'AccessDeniedException'])

export async function completeBedrock(
  input: CompleteInput,
  bedrock?: BedrockRuntimeClient,
): Promise<BedrockCompletion> {
  const client = bedrock ?? new BedrockRuntimeClient({ region: input.region })
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: input.maxTokens,
    temperature: input.temperature,
    system: input.prompt.system,
    messages: [{ role: 'user', content: input.prompt.user }],
  })

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
      ) as ClaudeResponse
      const text = json.content?.find((c) => c.type === 'text')?.text ?? json.content?.[0]?.text
      if (typeof text !== 'string') {
        throw new RetrievalError('bedrock_validation', 'Claude response missing content[0].text')
      }
      return {
        answer: text,
        // Exact usage tokens from the Bedrock response (R-8) — never estimated.
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
        modelId: input.modelId,
      }
    })
  } catch (err) {
    const name = (err as { name?: string })?.name
    if (name === 'ValidationException') {
      throw new RetrievalError('bedrock_validation', `Bedrock rejected the request: ${(err as Error).message}`)
    }
    if (name === 'AccessDeniedException') {
      throw new RetrievalError('bedrock_access_denied', `Bedrock access denied for ${input.modelId}`)
    }
    throw err
  }
}
