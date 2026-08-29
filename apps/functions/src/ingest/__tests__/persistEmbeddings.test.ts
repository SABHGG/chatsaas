import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
  RDSDataClient,
  ExecuteStatementCommand,
} from '@aws-sdk/client-rds-data'
import { persistChunks } from '../persistEmbeddings'
import type { EmbeddingRow } from '../types'

const rdsMock = mockClient(RDSDataClient)

function makeRow(i: number): EmbeddingRow {
  return {
    id: `id-${i}`,
    chatbotId: 'chat-1',
    companyId: 'company-acme',
    content: `content-${i}`,
    contentSha256: new Uint8Array(32),
    embedding: [0.1, 0.2, 0.3],
  }
}

beforeEach(() => {
  rdsMock.reset()
})

describe('persistChunks', () => {
  it('returns 0 inserted when no rows are passed', async () => {
    const out = await persistChunks(
      {
        clusterArn: 'arn:aws:rds:us-east-1:1:cluster:c',
        secretArn: 'arn:aws:secretsmanager:us-east-1:1:secret:s',
        database: 'chatsaas',
        region: 'us-east-1',
      },
      [],
    )
    expect(out.insertedCount).toBe(0)
  })

  it('inserts each row and reports the inserted count', async () => {
    rdsMock.on(ExecuteStatementCommand).resolves({ numberOfRecordsUpdated: 1 })
    const out = await persistChunks(
      {
        clusterArn: 'arn:aws:rds:us-east-1:1:cluster:c',
        secretArn: 'arn:aws:secretsmanager:us-east-1:1:secret:s',
        database: 'chatsaas',
        region: 'us-east-1',
      },
      [makeRow(0), makeRow(1), makeRow(2)],
    )
    expect(out.insertedCount).toBe(3)
  })

  it('reports 0 for rows skipped by ON CONFLICT DO NOTHING', async () => {
    rdsMock.on(ExecuteStatementCommand).resolves({ numberOfRecordsUpdated: 0 })
    const out = await persistChunks(
      {
        clusterArn: 'arn:aws:rds:us-east-1:1:cluster:c',
        secretArn: 'arn:aws:secretsmanager:us-east-1:1:secret:s',
        database: 'chatsaas',
        region: 'us-east-1',
      },
      [makeRow(0)],
    )
    expect(out.insertedCount).toBe(0)
  })

  it('propagates Data API errors', async () => {
    rdsMock.on(ExecuteStatementCommand).rejects(new Error('Data API error'))
    await expect(
      persistChunks(
        {
          clusterArn: 'arn:aws:rds:us-east-1:1:cluster:c',
          secretArn: 'arn:aws:secretsmanager:us-east-1:1:secret:s',
          database: 'chatsaas',
          region: 'us-east-1',
        },
        [makeRow(0)],
      ),
    ).rejects.toThrow(/Data API/)
  })
})
