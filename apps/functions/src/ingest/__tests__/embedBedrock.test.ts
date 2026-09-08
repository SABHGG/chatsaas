import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { embedChunks } from '../embedBedrock'
import type { Chunk } from '../types'

const brMock = mockClient(BedrockRuntimeClient)

function makeChunks(n: number): Chunk[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    content: `chunk-${i}`,
    contentSha256: new Uint8Array(32),
  }))
}

beforeEach(() => {
  brMock.reset()
})

describe('embedChunks', () => {
  it('returns [] for empty input', async () => {
    const out = await embedChunks([], { modelId: 'amazon.titan-embed-text-v2:0', region: 'us-east-1' })
    expect(out).toEqual([])
  })

  it('embeds a single chunk and returns one vector', async () => {
    brMock.on(InvokeModelCommand).resolves({
      body: new TextEncoder().encode(
        JSON.stringify({ embedding: [0.1, 0.2, 0.3], inputTextTokenCount: 4 }),
      ) as never,
    })
    const out = await embedChunks(makeChunks(1), {
      modelId: 'amazon.titan-embed-text-v2:0',
      region: 'us-east-1',
    })
    expect(out).toEqual([[0.1, 0.2, 0.3]])
  })

  it('batches up to 25 chunks per InvokeModel call', async () => {
    let callCount = 0
    brMock.on(InvokeModelCommand).callsFake(() => {
      callCount += 1
      return Promise.resolve({
        body: new TextEncoder().encode(
          JSON.stringify(
            Array.from({ length: 25 }, () => ({
              embedding: [0.0],
              inputTextTokenCount: 1,
            })),
          ),
        ),
      })
    })
    const out = await embedChunks(makeChunks(50), {
      modelId: 'amazon.titan-embed-text-v2:0',
      region: 'us-east-1',
    })
    expect(callCount).toBe(2)
    expect(out).toHaveLength(50)
  })

  it('retries on ThrottlingException and eventually succeeds', async () => {
    let attempt = 0
    brMock.on(InvokeModelCommand).callsFake(() => {
      attempt += 1
      if (attempt === 1) {
        const err = new Error('rate exceeded') as Error & { name: string }
        err.name = 'ThrottlingException'
        return Promise.reject(err)
      }
      return Promise.resolve({
        body: new TextEncoder().encode(
          JSON.stringify({ embedding: [0.5], inputTextTokenCount: 4 }),
        ),
      })
    })
    const out = await embedChunks(makeChunks(1), {
      modelId: 'amazon.titan-embed-text-v2:0',
      region: 'us-east-1',
    })
    expect(attempt).toBeGreaterThan(1)
    expect(out).toEqual([[0.5]])
  })

  it('does not retry on ValidationException', async () => {
    let attempt = 0
    brMock.on(InvokeModelCommand).callsFake(() => {
      attempt += 1
      const err = new Error('bad input') as Error & { name: string }
      err.name = 'ValidationException'
      return Promise.reject(err)
    })
    await expect(
      embedChunks(makeChunks(1), {
        modelId: 'amazon.titan-embed-text-v2:0',
        region: 'us-east-1',
      })
    ).rejects.toBeDefined()
    expect(attempt).toBe(1)
  })
})
