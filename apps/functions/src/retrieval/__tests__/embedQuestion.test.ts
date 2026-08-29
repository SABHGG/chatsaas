import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { embedQuestion } from '../embedQuestion'

const brMock = mockClient(BedrockRuntimeClient)

const OPTS = {
  question: 'What is the refund policy?',
  modelId: 'amazon.titan-embed-text-v2:0',
  region: 'us-east-1',
}

function embeddingBody(dims: number) {
  return new TextEncoder().encode(
    JSON.stringify({ embedding: Array.from({ length: dims }, () => 0.1) }),
  )
}

beforeEach(() => {
  brMock.reset()
  vi.restoreAllMocks()
})

describe('embedQuestion (Titan v2)', () => {
  it('sends the question and returns the 1024-dim embedding', async () => {
    brMock.on(InvokeModelCommand).resolves({ body: embeddingBody(1024) as never })

    const out = await embedQuestion(OPTS, brMock as unknown as BedrockRuntimeClient)

    expect(out).toHaveLength(1024)
    const input = brMock.calls()[0].args[0].input as InvokeModelCommand['input']
    expect(input.modelId).toBe('amazon.titan-embed-text-v2:0')
    expect(JSON.parse(String(input.body))).toEqual({ inputText: OPTS.question })
  })

  it('retries on ThrottlingException with backoff and succeeds', async () => {
    let attempt = 0
    brMock.on(InvokeModelCommand).callsFake(() => {
      attempt += 1
      if (attempt === 1) {
        const err = new Error('rate exceeded')
        err.name = 'ThrottlingException'
        return Promise.reject(err)
      }
      return Promise.resolve({ body: embeddingBody(1024) as never })
    })

    const out = await embedQuestion(OPTS, brMock as unknown as BedrockRuntimeClient)
    expect(attempt).toBe(2)
    expect(out).toHaveLength(1024)
  })

  it('fails fast on ValidationException (no retry)', async () => {
    let attempt = 0
    brMock.on(InvokeModelCommand).callsFake(() => {
      attempt += 1
      const err = new Error('bad input')
      err.name = 'ValidationException'
      return Promise.reject(err)
    })

    await expect(
      embedQuestion(OPTS, brMock as unknown as BedrockRuntimeClient),
    ).rejects.toMatchObject({ code: 'bedrock_validation' })
    expect(attempt).toBe(1)
  })
})
