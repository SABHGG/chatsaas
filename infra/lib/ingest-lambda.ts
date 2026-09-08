import { Duration, Stack } from "aws-cdk-lib";
import type { IFunction } from "aws-cdk-lib/aws-lambda";
import {
  Code,
  Runtime,
  Tracing,
} from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import type { ITable } from "aws-cdk-lib/aws-dynamodb";
import type { IBucket } from "aws-cdk-lib/aws-s3";
import type { IQueue } from "aws-cdk-lib/aws-sqs";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Construct } from "constructs";

/**
 * IngestLambda: triggered by EventBridge on s3:ObjectCreated:Put; reads the S3
 * object, parses it, embeds via Bedrock Titan v2, persists to `public.embeddings`
 * on Neon via the @neondatabase/serverless HTTP driver (ADR-008), and updates the
 * Document row in DynamoDB.
 *
 * The Lambda runs OUTSIDE any VPC: S3, DynamoDB, Bedrock, and SSM are reached
 * over public endpoints, and Neon is reached over TLS through the pooled
 * `-pooler` endpoint.
 *
 * IAM is least-privilege: scoped to the documents bucket ARN, the documents
 * table ARN, the Bedrock Titan v2 model ARN, the Neon URL SSM parameter, and
 * the DLQ ARN. The Lambda is the only path in.
 *
 * The handler is at `apps/functions/src/ingest/handler.ts` (sibling of the infra
 * package); `__dirname` resolution is relative to this file (`infra/lib/`), so
 * the path is `../../apps/functions/src/ingest/handler.ts`.
 */
const HANDLER_PATH = join(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
  "apps",
  "functions",
  "src",
  "ingest",
  "handler.ts",
);

export interface IngestLambdaConstructProps {
  readonly envName: "dev" | "prod";
  readonly documentsBucket: IBucket;
  readonly documentsTable: ITable;
  /** Name of the SSM SecureString holding the pooled Neon connection string. */
  readonly neonUrlParameterName: string;
  readonly dlq: IQueue;
}

export class IngestLambdaConstruct extends Construct {
  public readonly function: IFunction;

  constructor(scope: Construct, id: string, props: IngestLambdaConstructProps) {
    super(scope, id);

    const stack = Stack.of(this);
    const region = stack.region;
    const account = stack.account;

    const fn = new NodejsFunction(this, "Function", {
      functionName: `chatsaas-${props.envName}-ingest`,
      runtime: Runtime.NODEJS_20_X,
      entry: HANDLER_PATH,
      handler: "handler",
      memorySize: 1024,
      timeout: Duration.minutes(5),
      // Non-VPC by design (ADR-008): no vpc / vpcSubnets / securityGroups.
      tracing: Tracing.ACTIVE,
      logRetention: RetentionDays.ONE_MONTH,
      deadLetterQueue: props.dlq,
      reservedConcurrentExecutions: 10,
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node20",
        // Bundle every dependency — @neondatabase/serverless (fetch-based ESM)
        // and @aws-sdk/client-ssm are NOT in the Lambda Node 20 runtime's
        // bundled SDK subset, so nothing is left to the runtime's discretion.
        externalModules: [],
      },
      environment: {
        DOCUMENTS_BUCKET: props.documentsBucket.bucketName,
        DOCUMENTS_TABLE: props.documentsTable.tableName,
        NEON_URL_PARAMETER_NAME: props.neonUrlParameterName,
        BEDROCK_EMBED_MODEL_ID: "amazon.titan-embed-text-v2:0",
        CHUNK_SIZE: "1000",
        CHUNK_OVERLAP: "200",
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
        LOG_LEVEL: "info",
        BEDROCK_REGION: region,
      },
    });

    // S3: read-only on the documents bucket.
    props.documentsBucket.grantRead(fn);

    // DynamoDB: GetItem + UpdateItem only (least privilege).
    // grantReadWriteData grants Scan/Query/Put/Delete/BatchWrite which are not needed.
    props.documentsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

    // Bedrock: invoke Titan v2 only.
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${region}::foundation-model/amazon.titan-embed-text-v2:0`,
        ],
      }),
    );

    // SSM: read the Neon URL SecureString only (least privilege; WithDecryption
    // against the AWS-managed `aws/ssm` key needs no extra kms grant).
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${region}:${account}:parameter/${props.neonUrlParameterName}`,
        ],
      }),
    );

    // DLQ writes happen automatically via the L2 deadLetterQueue wiring, but be explicit.
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["sqs:SendMessage"],
        resources: [props.dlq.queueArn],
      }),
    );

    this.function = fn;
  }
}
