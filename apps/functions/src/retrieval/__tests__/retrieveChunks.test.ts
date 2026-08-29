import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data'
import { retrieveChunks } from '../retrieveChunks'

const rdsMock = mockClient(RDSDataClient)

const BASE = {
  clusterArn: 'arn:aws:rds:us-east-1:1:cluster:c',
  secretArn: 'arn:aws:secretsmanager:us-east-1:1:secret:s',
  database: 'chatsaas',
  region: 'us-east-1',
  embedding: [0.1, 0.2, 0.3],
  topK: 10,
}

function row(id: string, score: number) {
  return [
    { stringValue: id },
    { stringValue: `content of ${id}` },
    { doubleValue: score },
  ]
}

beforeEach(() => {
  rdsMock.reset()
})

describe('retrieveChunks (R-1 scope, pgvector)', () => {
  it('builds the query from the chatbot row values only — a spoofed body company_id cannot enter the SQL', async () => {
    rdsMock.on(ExecuteStatementCommand).resolves({ records: [row('r1', 0.12)] })

    await retrieveChunks(
      { ...BASE, chatbotId: 'chat-1', companyId: 'company-from-chatbot-row' },
      rdsMock as unknown as RDSDataClient,
    )

    const input = rdsMock.calls()[0].args[0].input as ExecuteStatementCommand['input']
    expect(input.sql).toContain('chatbot_id = :chatbotId AND company_id = :companyId')
    const params = Object.fromEntries(
      ((input.parameters ?? []) as Array<{ name?: string; value?: { stringValue?: string; longValue?: number } }>).map((p) => [p.name, p.value?.stringValue ?? p.value?.longValue]),
    )
    // Trusted scope only: values come from the chatbot row, never a request.
    expect(params.chatbotId).toBe('chat-1')
    expect(params.companyId).toBe('company-from-chatbot-row')
    expect(Object.keys(params)).not.toContain('companyIdFromBody')
    expect(input.sql).toContain('ORDER BY embedding <=> :embedding::vector')
    expect(input.sql).toContain('LIMIT :topK')
  })

  it('returns chunks with id/content/score and respects topK', async () => {
    rdsMock
      .on(ExecuteStatementCommand)
      .resolves({ records: [row('r1', 0.05), row('r2', 0.11), row('r3', 0.2)] })

    const chunks = await retrieveChunks(
      { ...BASE, chatbotId: 'chat-1', companyId: 'company-acme', topK: 3 },
      rdsMock as unknown as RDSDataClient,
    )

    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toEqual({ id: 'r1', content: 'content of r1', score: 0.05 })
  })

  it('returns [] on zero rows (empty-retrieval path)', async () => {
    rdsMock.on(ExecuteStatementCommand).resolves({ records: [] })
    const chunks = await retrieveChunks(
      { ...BASE, chatbotId: 'chat-1', companyId: 'company-acme' },
      rdsMock as unknown as RDSDataClient,
    )
    expect(chunks).toEqual([])
  })

  it('maps Data API failures to typed db_error', async () => {
    rdsMock.on(ExecuteStatementCommand).rejects(new Error('Data API down'))
    await expect(
      retrieveChunks(
        { ...BASE, chatbotId: 'chat-1', companyId: 'company-acme' },
        rdsMock as unknown as RDSDataClient,
      ),
    ).rejects.toMatchObject({ code: 'db_error' })
  })
})
