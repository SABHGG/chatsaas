import { Duration } from "aws-cdk-lib";
import type { ISecurityGroup, IVpc } from "aws-cdk-lib/aws-ec2";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import type { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import type { IServerlessCluster } from "aws-cdk-lib/aws-rds";
import { CustomResource } from "aws-cdk-lib/core";
import { Provider } from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

/**
 * The SQL that the custom resource runs. Exposed as a constant so the vitest suite can
 * assert that the literal strings appear in the synthesized Lambda inline code.
 *
 * - Adds a `content_sha256` column for idempotency checks (BYTEA, 32 bytes).
 * - Creates a unique index on `(chatbot_id, content_sha256)` so the IngestLambda's
 *   `INSERT ... ON CONFLICT DO NOTHING` is a true no-op for re-embedded chunks.
 * - ANALYZE so the planner picks the index from the first query.
 */
export const EMBEDDINGS_UNIQUE_INDEX_SQL = `
ALTER TABLE IF EXISTS public.embeddings ADD COLUMN IF NOT EXISTS content_sha256 BYTEA;

CREATE UNIQUE INDEX IF NOT EXISTS embeddings_chatbot_content_sha256_idx
  ON public.embeddings (chatbot_id, content_sha256);

ANALYZE public.embeddings;
`;

/**
 * The custom resource depends on the embeddings table existing; the caller is responsible
 * for adding a `dependsOn` against the table's custom resource (see
 * `chat-saas-stack.ts`). The Lambda in this construct is VPC-scoped so it can reach the
 * RDS Data API endpoint; the security group is shared with the table Lambda.
 */
export interface EmbeddingsUniqueIndexConstructProps {
  readonly cluster: IServerlessCluster;
  readonly secret: ISecret;
  readonly databaseName: string;
  readonly vpc: IVpc;
  readonly lambdaSecurityGroup: ISecurityGroup;
  readonly dependencies?: Construct[];
}

export class EmbeddingsUniqueIndexConstruct extends Construct {
  public readonly resource: CustomResource;
  public readonly function: Function;

  constructor(scope: Construct, id: string, props: EmbeddingsUniqueIndexConstructProps) {
    super(scope, id);

    const sql = EMBEDDINGS_UNIQUE_INDEX_SQL;

    this.function = new Function(this, "IndexLambda", {
      runtime: Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: Code.fromInline(`
"use strict";
const { RDSDataClient, ExecuteStatementCommand } = require("@aws-sdk/client-rds-data");

const SQL = ${JSON.stringify(sql)};

const clusterArn = process.env.CLUSTER_ARN;
const secretArn = process.env.SECRET_ARN;
const database = process.env.DATABASE;
const region = process.env.AWS_REGION;

const rds = new RDSDataClient({ region });

exports.handler = async (event) => {
  // Run on Create and Update; Delete is a no-op because the cluster is RETAIN-protected
  // and the index drops with the table.
  if (event && event.RequestType === "Delete") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "delete" }) };
  }

  const statements = SQL.split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await rds.send(new ExecuteStatementCommand({
      resourceArn: clusterArn,
      secretArn: secretArn,
      database: database,
      sql: statement,
    }));
  }
  return { statusCode: 200, body: JSON.stringify({ message: "embeddings index ready" }) };
};
`),
      vpc: props.vpc,
      securityGroups: [props.lambdaSecurityGroup],
      timeout: Duration.seconds(120),
      memorySize: 512,
      environment: {
        CLUSTER_ARN: props.cluster.clusterArn,
        SECRET_ARN: props.secret.secretArn,
        DATABASE: props.databaseName,
      },
    });

    props.cluster.grantDataApiAccess(this.function);

    const provider = new Provider(this, "Provider", {
      onEventHandler: this.function,
    });

    this.resource = new CustomResource(this, "Resource", {
      serviceToken: provider.serviceToken,
    });

    for (const dep of props.dependencies ?? []) {
      this.resource.node.addDependency(dep);
    }
  }
}
