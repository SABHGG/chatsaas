import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { completeBedrock } from '../completeBedrock'
import type { BuiltPrompt } from '../types'

const brMock = mockClient(BedrockRuntimeClient)

const OPTS = {
  modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
  region: 'us-east-1',
  maxTokens: 1024,
  temperature: 0.2,
}

const PROMPT: BuiltPrompt = { system: 'be helpful', user: 'question here' }

function claudeBody(text: string, inputTokens = 42, outputTokens = 87) {
  return new TextEncoder().encode(
    JSON.stringify({
      content: [{ type: 'text', text }],
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    }),
  )
}

beforeEach(() => {
  brMock.reset()
})

describe('completeBedrock (Claude 3.5 Sonnet)', () => {
  it('sends the anthropic messages body and parses content[0].text', async () => {
    brMock.on(InvokeModelCommand).resolves({ body: claudeBody('the answer') as never })

    const out = await completeBedrock({ prompt: PROMPT, ...OPTS }, brMock as unknown as BedrockRuntimeClient)

    expect(out.answer).toBe('the answer')
    expect(out.modelId).toBe(OPTS.modelId)
    const input = brMock.calls()[0].args[0].input as InvokeModelCommand['input']
    expect(input.modelId).toBe(OPTS.modelId)
    const body = JSON.parse(String(input.body))
    expect(body.system).toBe('be helpful')
    expect(body.messages).toEqual([{ role: 'user', content: 'question here' }])
    expect(body.anthropic_version).toBe('bedrock-2023-05-31')
  })

  it('parses the EXACT usage tokens (R-8: no estimation)', async () => {
    brMock.on(InvokeModelCommand).resolves({ body: claudeBody('ok', 123, 456) as never })
    const out = await completeBedrock({ prompt: PROMPT, ...OPTS }, brMock as unknown as BedrockRuntimeClient)
    expect(out.inputTokens).toBe(123)
    expect(out.outputTokens).toBe(456)
  })

  it('retries ThrottlingException up to 5 attempts with backoff (R-3)', async () => {
    let attempt = 0
    brMock.on(InvokeModelCommand).callsFake(() => {
      attempt += 1
      const err = new Error('throttled')
      err.name = 'ThrottlingException'
      return Promise.reject(err)
    })

    await expect(
      completeBedrock({ prompt: PROMPT, ...OPTS }, brMock as unknown as BedrockRuntimeClient),
    ).rejects.toMatchObject({ name: 'ThrottlingException' })
    expect(attempt).toBe(5)
  })

  it('recovers when throttling clears before the 5th attempt', async () => {
    let attempt = 0
    brMock.on(InvokeModelCommand).callsFake(() => {
      attempt += 1
      if (attempt < 3) {
        const err = new Error('throttled')
        err.name = 'ThrottlingException'
        return Promise.reject(err)
      }
      return Promise.resolve({ body: claudeBody('recovered') as never })
    })

    const out = await completeBedrock({ prompt: PROMPT, ...OPTS }, brMock as unknown as BedrockRuntimeClient)
    expect(out.answer).toBe('recovered')
    expect(attempt).toBe(3)
  })

  it.each(['ValidationException', 'AccessDeniedException'])(
    'fails fast on %s (no retry)',
    async (name) => {
      let attempt = 0
      brMock.on(InvokeModelCommand).callsFake(() => {
        attempt += 1
        const err = new Error(name)
        err.name = name
        return Promise.reject(err)
      })

      await expect(
        completeBedrock({ prompt: PROMPT, ...OPTS }, brMock as unknown as BedrockRuntimeClient),
      ).rejects.toMatchObject({ code: name === 'ValidationException' ? 'bedrock_validation' : 'bedrock_access_denied' })
      expect(attempt).toBe(1)
    },
  )
})
