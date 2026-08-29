import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { debitConversation } from '../debitConversation'

const ddbMock = mockClient(DynamoDBDocumentClient)

const CREDITS_TABLE = 'credits'

function throttleCheckError() {
  const err = new Error('The conditional request failed')
  err.name = 'ConditionalCheckFailedException'
  Object.setPrototypeOf(err, ConditionalCheckFailedException.prototype)
  return err as ConditionalCheckFailedException
}

beforeEach(() => {
  ddbMock.reset()
})

describe('debitConversation (atomic UpdateItem, R-2)', () => {
  it('debits with a ConditionExpression balance >= :cost (WI-002 pattern)', async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { balance: 9 } })

    const out = await debitConversation(ddbMock as unknown as DynamoDBDocumentClient, {
      creditsTable: CREDITS_TABLE,
      companyId: 'company-acme',
      cost: 1,
    })

    expect(out.newBalance).toBe(9)
    const input = ddbMock.calls()[0].args[0].input as UpdateCommand['input']
    expect(input.ConditionExpression).toBe('balance >= :cost')
    expect(input.UpdateExpression).toContain('balance = balance - :cost')
    expect(input.ExpressionAttributeValues?.[':cost']).toBe(1)
  })

  it('throws typed prepaid_credits_exhausted on condition failure (no Bedrock call)', async () => {
    ddbMock.on(UpdateCommand).rejects(throttleCheckError())

    await expect(
      debitConversation(ddbMock as unknown as DynamoDBDocumentClient, {
        creditsTable: CREDITS_TABLE,
        companyId: 'company-acme',
        cost: 1,
      }),
    ).rejects.toMatchObject({ code: 'prepaid_credits_exhausted' })
  })

  it('R-2 concurrency: balance=1, two parallel debits → exactly one success, one 402', async () => {
    // Simulate DynamoDB's atomic decrement: the conditional update succeeds
    // only while the stored balance is >= 1.
    let storedBalance = 1
        ddbMock.on(UpdateCommand).callsFake(async (cmd: UpdateCommand["input"]) => {
          const cost = Number(cmd.ExpressionAttributeValues?.[":cost"] ?? 1)
          if (storedBalance >= cost) {
            storedBalance -= cost
            return { Attributes: { balance: storedBalance } }
          }
          throw throttleCheckError()
    })

    const results = await Promise.allSettled([
      debitConversation(ddbMock as unknown as DynamoDBDocumentClient, {
        creditsTable: CREDITS_TABLE,
        companyId: 'company-acme',
        cost: 1,
      }),
      debitConversation(ddbMock as unknown as DynamoDBDocumentClient, {
        creditsTable: CREDITS_TABLE,
        companyId: 'company-acme',
        cost: 1,
      }),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter(
      (r) =>
        r.status === 'rejected' &&
        (r.reason as { code?: string }).code === 'prepaid_credits_exhausted',
    )
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(storedBalance).toBe(0)
  })
})
