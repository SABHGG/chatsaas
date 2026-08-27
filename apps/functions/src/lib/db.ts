import {
  DynamoDBClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommandInput,
  GetCommandInput,
  UpdateCommandInput,
  DeleteCommandInput,
  ScanCommandInput,
  QueryCommandInput,
  marshall,
  unmarshall,
} from '@aws-sdk/lib-dynamodb';

// DynamoDB Client configured for both local and production
// In production (Lambda): uses default credential chain
// In local/dev: AWS_ENDPOINT_URL env var routes to localhost:4566
export const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
  // endpoint will be picked up from env if set (DynamoDB Local)
  // otherwise assumes real DynamoDB in AWS
});

// Wrap with DocumentClient for higher-level convenience APIs
export const dynamoDB = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: {
    removeUndefinedValues: false,
  },
  unmarshallOptions: {
    convertClassMap: null, // preserves numbers as numbers
  },
  serializeOptions: {
    convertEnum: true,
  },
});

// Helper: marshes a plain JS object into the DynamoDB format
export function marshal(data: Record<string, any>): Record<string, any> {
  return marshall(data);
}

// Helper: unmarshals DynamoDB response back to plain JS
export function unmarshal(data: Record<string, any>): Record<string, any> {
  return unmarshall(data);
}

// === Core CRUD helpers (used by all handlers) ===

/**
 * Put an item into a table
 */
export async function put(
  tableName: string,
  item: Record<string, any>,
  options: { marshall?: boolean } = {}
) {
  const input: PutCommandInput = {
    TableName: tableName,
    Item: options.marshall ? marshal(item) : item,
  };
  const command = new PutCommand(input);
  await dynamoDB.send(command);
  return input.Item;
}

/**
 * Get an item by primary key
 */
export async function get<
  T extends Record<string, any> = Record<string, any>,
>(
  tableName: string,
  key: Record<string, any>
) {
  const input: GetCommandInput = {
    TableName: tableName,
    Key: marshall(key),
  };
  const command = new GetCommand(input);
  const { Item } = await dynamoDB.send(command);
  return Item ? unmarshal<Item>(Item) : null;
}

/**
 * Query items by index/key condition
 */
export async function query<
  T extends Record<string, any> = Record<string, any>,
>(
  tableName: string,
  input: QueryCommandInput & { IndexName?: string }
) {
  const cmd = new QueryCommand(input);
  const { Items } = await dynamoDB.send(cmd);
  return Items ? Items.map((i: any) => unmarshal(i)) : [] as T[];
}

/**
 * Scan a table (returns all items, use with pagination in production)
 */
export async function scan<
  T extends Record<string, any> = Record<string, any>,
>(
  tableName: string,
  input?: ScanCommandInput
) {
  const cmd = new ScanCommand({ TableName: tableName, ...input });
  const { Items } = await dynamoDB.send(cmd);
  return Items ? Items.map((i: any) => unmarshal(i)) : [] as T[];
}

/**
 * Update an item by key
 */
export async function update(
  tableName: string,
  key: Record<string, any>,
  attrs: Record<string, any>
) {
  const input: UpdateCommandInput = {
    TableName: tableName,
    Key: marshall(key),
    UpdateExpression: 'set ' + Object.keys(attrs)
      .map((k) => `#${k} = :${k}`)
      .join(', '),
    ExpressionAttributeNames: Object.keys(attrs).reduce(
      (acc, k) => ({ ...acc, [`#${k}`]: k }),
      {}
    ),
    ExpressionAttributeValues: Object.entries(attrs).reduce(
      (acc, [k, v]) => ({ ...acc, [`:${k}`]: v }),
      {}
    ),
    ReturnValues: 'ALL_NEW',
  };
  const command = new UpdateCommand(input);
  const { Attributes } = await dynamoDB.send(command);
  return Attributes ? unmarshal(Attributes) : null;
}

/**
 * Delete an item by key
 */
export async function del(
  tableName: string,
  key: Record<string, any>
) {
  const input: DeleteCommandInput = {
    TableName: tableName,
    Key: marshall(key),
  };
  const command = new DeleteCommand(input);
  await dynamoDB.send(command);
  return true;
}

export type { DynamoDBClient, DynamoDBDocumentClient };