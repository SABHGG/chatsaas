import { describe, it, expect, vi } from 'vitest'
import { persistChunks, type NeonQueryFn } from '../persistEmbeddings'
import type { EmbeddingRow } from '../types'

function makeRow(i: number): EmbeddingRow {
  return {
    chatbotId: 'chat-1',
    companyId: 'company-acme',
    content: `content-${i}`,
    contentSha256: new Uint8Array(32),
    embedding: [0.1, 0.2, 0.3],
  }
}

function fakeQuery(returns: { id: string }[] = []): NeonQueryFn & { calls: { text: string; params: unknown[] }[] } {
  const calls: { text: string; params: unknown[] }[] = []
  const fn = vi.fn(async (text: string, params?: unknown[]) => {
    calls.push({ text, params: params ?? [] })
    return returns
  }) as unknown as NeonQueryFn & { calls: { text: string; params: unknown[] }[] }
  fn.calls = calls
  return fn
}

describe('persistChunks', () => {
  it('returns 0 inserted when no rows are passed', async () => {
    const query = fakeQuery()
    const out = await persistChunks({ neonUrl: 'postgresql://neon/test' }, [], query)
    expect(out.insertedCount).toBe(0)
    expect(query.calls).toHaveLength(0)
  })

  it('inserts rows with ON CONFLICT (chatbot_id, content_sha256) DO NOTHING', async () => {
    const query = fakeQuery([{ id: 'id-0' }, { id: 'id-1' }])
    const out = await persistChunks({ neonUrl: 'postgresql://neon/test' }, [makeRow(0), makeRow(1)], query)
    expect(out.insertedCount).toBe(2)
    expect(query.calls).toHaveLength(1)
    const { text, params } = query.calls[0]
    expect(text).toContain('ON CONFLICT (chatbot_id, content_sha256) DO NOTHING')
    expect(text).toContain('RETURNING id')
    expect(text).toContain('$1::uuid')
    expect(text).toContain('$5::vector')
    // One tuple per row: 5 bind params each.
    expect(params).toHaveLength(10)
    expect(params[0]).toBe('chat-1')
    expect(params[1]).toBe('company-acme')
    expect(params[4]).toBe('[0.1,0.2,0.3]')
  })

  it('binds content_sha256 as a bytea hex literal', async () => {
    const query = fakeQuery([{ id: 'id-0' }])
    await persistChunks({ neonUrl: 'postgresql://neon/test' }, [makeRow(0)], query)
    const { text, params } = query.calls[0]
    expect(text).toContain('$4::bytea')
    expect(params[3]).toBe(`\\x${'00'.repeat(32)}`)
  })

  it('reports 0 for rows skipped by ON CONFLICT DO NOTHING', async () => {
    const query = fakeQuery([])
    const out = await persistChunks({ neonUrl: 'postgresql://neon/test' }, [makeRow(0)], query)
    expect(out.insertedCount).toBe(0)
  })

  it('batches inserts above the per-statement row cap', async () => {
    const query = fakeQuery([])
    const rows = Array.from({ length: 1001 }, (_, i) => makeRow(i))
    const out = await persistChunks({ neonUrl: 'postgresql://neon/test' }, rows, query)
    expect(out.insertedCount).toBe(0)
    // 500 + 500 + 1
    expect(query.calls).toHaveLength(3)
    expect(query.calls[0].params).toHaveLength(2500)
    expect(query.calls[2].params).toHaveLength(5)
  })

  it('propagates driver errors', async () => {
    const query = vi.fn(async () => {
      throw new Error('Neon HTTP error')
    }) as unknown as NeonQueryFn
    await expect(
      persistChunks({ neonUrl: 'postgresql://neon/test' }, [makeRow(0)], query),
    ).rejects.toThrow(/Neon HTTP/)
  })
})
