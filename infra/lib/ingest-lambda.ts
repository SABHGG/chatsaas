import { Duration, Stack } from "aws-cdk-lib";
import type { ISecurityGroup, IVpc, SubnetSelection } from "aws-cdk-lib/aws-ec2";
import { SubnetType } from "aws-cdk-lib/aws-ec2";
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
import type { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import type { IQueue } from "aws-cdk-lib/aws-sqs";
import type { CustomResource } from "aws-cdk-lib/core";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Construct } from "constructs";

/**
 * IngestLambda: triggered by EventBridge on s3:ObjectCreated:Put; reads the S3 object,
 * parses it, embeds via Bedrock Titan v2, persists to `public.embeddings` via RDS Data API,
 * and updates the Document row in DynamoDB.
 *
 * IAM is least-privilege: scoped to the documents bucket ARN, the documents table ARN,
 * the companies table ARN, the Bedrock Titan v2 model ARN, the cluster ARN, the secret
 * ARN, and the DLQ ARN. The Lambda is the only path in.
 *
 * The handler is at `apps/functions/src/ingest/handler.ts` (sibling of the infra package);
 * `__dirname` resolution is relative to this file (`infra/lib/`), so the path is
 * `../../apps/functions/src/ingest/handler.ts`.
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
  readonly dbSecret: ISecret;
  readonly dbClusterArn: string;
  readonly dbName: string;
  readonly vpc: IVpc;
  readonly lambdaSecurityGroup: ISecurityGroup;
  readonly dlq: IQueue;
  readonly documentsIndexResource: CustomResource;
  readonly subnetSelection?: SubnetSelection;
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
      vpc: props.vpc,
      vpcSubnets:
        props.subnetSelection ?? { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.lambdaSecurityGroup],
      tracing: Tracing.ACTIVE,
      logRetention: RetentionDays.ONE_MONTH,
      deadLetterQueue: props.dlq,
      reservedConcurrentExecutions: 10,
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node20",
        externalModules: ["@aws-sdk/*"],
      },
      environment: {
        DOCUMENTS_BUCKET: props.documentsBucket.bucketName,
        DOCUMENTS_TABLE: props.documentsTable.tableName,
        DB_SECRET_ARN: props.dbSecret.secretArn,
        DB_CLUSTER_ARN: props.dbClusterArn,
        DB_NAME: props.dbName,
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

    // RDS Data API: execute statements on the cluster.
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["rds-data:ExecuteStatement"],
        resources: [props.dbClusterArn],
      }),
    );

    // Secrets Manager: read the master password for RDS Data API auth.
    props.dbSecret.grantRead(fn);

    // DLQ writes happen automatically via the L2 deadLetterQueue wiring, but be explicit.
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["sqs:SendMessage"],
        resources: [props.dlq.queueArn],
      }),
    );

    // Ensure the unique index custom resource runs before the Lambda can invoke.
    fn.node.addDependency(props.documentsIndexResource);

    this.function = fn;
    // Touch the unused `account` for symmetry; the construct API doesn't expose it but
    // future ARNs may need it.
    void account;
  }
}
