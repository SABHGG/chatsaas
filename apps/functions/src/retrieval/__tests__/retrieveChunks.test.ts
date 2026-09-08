import { describe, it, expect } from 'vitest'
import { retrieveChunks } from '../retrieveChunks'
import type { NeonQueryFn } from '../../ingest/persistEmbeddings'

const BASE = {
  embedding: [0.1, 0.2, 0.3],
  topK: 10,
}

/** Captures the (sql, params) the code issues and returns canned rows. */
function fakeQuery(rows: unknown[]): { query: NeonQueryFn; calls: Array<{ sql: string; params: unknown[] }> } {
  const calls: Array<{ sql: string; params: unknown[] }> = []
  const query: NeonQueryFn = async (sql, params) => {
    calls.push({ sql, params: (params ?? []) as unknown[] })
    return rows
  }
  return { query, calls }
}

describe('retrieveChunks (R-1 scope, pgvector over Neon)', () => {
  it('builds the query from the chatbot row values only — a spoofed body company_id cannot enter the SQL', async () => {
    const { query, calls } = fakeQuery([{ id: 'r1', content: 'c', score: 0.12 }])

    await retrieveChunks({
      ...BASE,
      query,
      chatbotId: 'chat-1',
      companyId: 'company-from-chatbot-row',
    })

    expect(calls).toHaveLength(1)
    const { sql, params } = calls[0]
    expect(sql).toContain('chatbot_id = $2::uuid AND company_id = $3::uuid')
    // Trusted scope only: values come from the chatbot row, never a request.
    expect(params[1]).toBe('chat-1')
    expect(params[2]).toBe('company-from-chatbot-row')
    expect(sql).toContain('ORDER BY embedding <=> $1::vector')
    expect(sql).toContain('LIMIT $4')
    // Vector literal is the first parameter (positional, Neon driver).
    expect(params[0]).toBe('[0.1,0.2,0.3]')
    expect(params[3]).toBe(10)
  })

  it('returns chunks with id/content/score and respects topK', async () => {
    const { query } = fakeQuery([
      { id: 'r1', content: 'content of r1', score: 0.05 },
      { id: 'r2', content: 'content of r2', score: 0.11 },
      { id: 'r3', content: 'content of r3', score: 0.2 },
    ])

    const chunks = await retrieveChunks({
      ...BASE,
      query,
      chatbotId: 'chat-1',
      companyId: 'company-acme',
      topK: 3,
    })

    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toEqual({ id: 'r1', content: 'content of r1', score: 0.05 })
  })

  it('returns [] on zero rows (empty-retrieval path)', async () => {
    const { query } = fakeQuery([])
    const chunks = await retrieveChunks({
      ...BASE,
      query,
      chatbotId: 'chat-1',
      companyId: 'company-acme',
    })
    expect(chunks).toEqual([])
  })

  it('maps query failures to typed db_error', async () => {
    const query: NeonQueryFn = async () => {
      throw new Error('Neon down')
    }
    await expect(
      retrieveChunks({ ...BASE, query, chatbotId: 'chat-1', companyId: 'company-acme' }),
    ).rejects.toMatchObject({ code: 'db_error' })
  })

  it('throws db_error when a row is missing id/content columns', async () => {
    const { query } = fakeQuery([{ id: 'r1', score: 0.1 }])
    await expect(
      retrieveChunks({ ...BASE, query, chatbotId: 'chat-1', companyId: 'company-acme' }),
    ).rejects.toMatchObject({ code: 'db_error' })
  })
})
