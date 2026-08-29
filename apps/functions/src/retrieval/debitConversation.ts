import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { RetrievalError } from './types.js'

/**
 * Atomic prepaid-credit debit (R-2, mirrors the WI-002 `creditsDebit`
 * pattern): a single DynamoDB `UpdateItem` with
 * `ConditionExpression: balance >= :cost` so two concurrent debits under
 * balance=1 produce exactly one success and one typed
 * `InsufficientCredits` (→ 402, no Bedrock call).
 */
export interface DebitConversationInput {
  creditsTable: string
  companyId: string
  /** Cost of one completed conversation in credits (1 per ADR-005). */
  cost: number
}

/**
 * Atomic `UpdateItem` + `ConditionExpression` debit through the
 * DocumentClient (plain values, same shape as WI-002's `updateExpr`).
 * Throws typed `prepaid_credits_exhausted` on condition failure.
 */
export async function debitConversation(
  ddb: DynamoDBDocumentClient,
  input: DebitConversationInput,
): Promise<{ newBalance: number }> {
  try {
    const resp = await ddb.send(
      new UpdateCommand({
        TableName: input.creditsTable,
        Key: { id: input.companyId },
        UpdateExpression: 'SET balance = balance - :cost, updatedAt = :now',
        ConditionExpression: 'balance >= :cost',
        ExpressionAttributeValues: {
          ':cost': input.cost,
          ':now': new Date().toISOString(),
        },
        ReturnValues: 'UPDATED_NEW',
      }),
    )
    const newBalance = Number(resp.Attributes?.balance ?? 0)
    return { newBalance }
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException || (err as { name?: string }).name === 'ConditionalCheckFailedException') {
      throw new RetrievalError(
        'prepaid_credits_exhausted',
        `Insufficient prepaid credits for company ${input.companyId}`,
      )
    }
    throw err
  }
}
