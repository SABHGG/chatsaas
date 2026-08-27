import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
import type { UpdateCommandInput } from '@aws-sdk/lib-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { TABLES } from '@/db/schema'

// DynamoDB Client configured for both local and production.
// In production (Lambda): uses default credential chain.
// In local/dev: AWS_ENDPOINT_URL env var routes to DynamoDB Local on :4566.
export const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
})

// DocumentClient wraps the low-level client and (un)marshalls plain JS
// objects to/from DynamoDB AttributeValues automatically. That's why every
// helper below accepts a `Record<string, any>` instead of an `AttributeValue`
// map — the DocumentClient handles the conversion.
export const dynamoDB = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
})

// Re-export the marshall helpers for callers that need to handle raw
// AttributeValue maps (e.g. tests asserting on the DynamoDB shape directly).
export { marshall, unmarshall }

// Re-export TABLES so handlers can do a single `import { ... TABLES } from
// '@/lib/db'`. Keeps the dependency direction clean (lib -> db/schema only).
export { TABLES }

// === Core CRUD helpers (used by all handlers) ===

/**
 * Put an item into a table. Returns the raw PutCommand output.
 *
 * When `options.conditionExpression` is provided, the PutItem is conditional
 * (e.g. `attribute_not_exists(pk)` to enforce create-only). Throws
 * `ConditionalCheckFailedException` when the condition is not met.
 */
export async function put(
  tableName: string,
  item: Record<string, any>,
  options: {
    conditionExpression?: string
    expressionAttributeNames?: Record<string, string>
    expressionAttributeValues?: Record<string, any>
  } = {}
): Promise<Record<string, any>> {
  const input: ConstructorParameters<typeof PutCommand>[0] = {
    TableName: tableName,
    Item: item,
  }
  if (options.conditionExpression) {
    input.ConditionExpression = options.conditionExpression
  }
  if (options.expressionAttributeNames) {
    input.ExpressionAttributeNames = options.expressionAttributeNames
  }
  if (options.expressionAttributeValues) {
    input.ExpressionAttributeValues = options.expressionAttributeValues
  }
  const command = new PutCommand(input)
  const response = await dynamoDB.send(command)
  return response as Record<string, any>
}

/**
 * Get a single item by primary key. Returns the unmarshalled item or undefined.
 */
export async function get(
  tableName: string,
  key: Record<string, any>
): Promise<Record<string, any> | undefined> {
  const command = new GetCommand({
    TableName: tableName,
    Key: key,
  })
  const response = await dynamoDB.send(command)
  return (response as { Item?: Record<string, any> }).Item
}

/**
 * Scan a table and return all matching items. For production queries prefer
 * `query` with an Index/KeyConditionExpression — scan is O(n) over the table.
 */
export async function scan<T = Record<string, any>>(
  tableName: string
): Promise<T[]> {
  const command = new ScanCommand({
    TableName: tableName,
  })
  const response = await dynamoDB.send(command)
  return ((response as { Items?: T[] }).Items ?? []) as T[]
}

/**
 * Update an item by primary key. Returns the new attribute values after the update.
 */
export async function update(
  tableName: string,
  key: Record<string, any>,
  updates: Record<string, any>
): Promise<Record<string, any>> {
  const keys = Object.keys(updates)
  const updateExpression =
    'SET ' + keys.map((k) => `#${k} = :${k}`).join(', ')
  const expressionAttributeNames: Record<string, string> = {}
  const expressionAttributeValues: Record<string, any> = {}
  for (const k of keys) {
    expressionAttributeNames[`#${k}`] = k
    expressionAttributeValues[`:${k}`] = updates[k]
  }

  const command = new UpdateCommand({
    TableName: tableName,
    Key: key,
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  })
  const response = await dynamoDB.send(command)
  return (response as { Attributes?: Record<string, any> }).Attributes ?? {}
}

/**
 * Update with a raw UpdateExpression and optional ConditionExpression.
 * Use this for atomic operations like `SET balance = balance - :amount`
 * where the update expression is not a simple key-value assignment.
 *
 * Throws ConditionalCheckFailedException when the condition is not met.
 * Catch it in the handler to return a domain-specific error (e.g. 402).
 */
export async function updateExpr(
  tableName: string,
  key: Record<string, any>,
  updateExpression: string,
  expressionAttributeValues: Record<string, any>,
  conditionExpression?: string
): Promise<Record<string, any>> {
  const input: UpdateCommandInput = {
    TableName: tableName,
    Key: key,
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  }
  if (conditionExpression) {
    input.ConditionExpression = conditionExpression
  }
  const command = new UpdateCommand(input)
  const response = await dynamoDB.send(command)
  return (response as { Attributes?: Record<string, any> }).Attributes ?? {}
}

/**
 * Query a table by partition key. For now this delegates to the DocumentClient
 * with a KeyConditionExpression built from a single partition key value.
 */
export async function query(
  tableName: string,
  partitionKeyName: string,
  partitionKeyValue: any
): Promise<Record<string, any>[]> {
  const command = new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: `#pk = :pkv`,
    ExpressionAttributeNames: { '#pk': partitionKeyName },
    ExpressionAttributeValues: { ':pkv': partitionKeyValue },
  })
  const response = await dynamoDB.send(command)
  return ((response as { Items?: Record<string, any>[] }).Items ?? [])
}

/**
 * Delete an item by primary key.
 */
export async function del(
  tableName: string,
  key: Record<string, any>
): Promise<Record<string, any>> {
  const command = new DeleteCommand({
    TableName: tableName,
    Key: key,
  })
  const response = await dynamoDB.send(command)
  return response as Record<string, any>
}