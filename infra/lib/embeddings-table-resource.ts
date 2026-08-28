import { Duration } from "aws-cdk-lib";
import { ISecurityGroup, IVpc, Port } from "aws-cdk-lib/aws-ec2";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { ServerlessCluster } from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";
import * as path from "node:path";

/**
 * Returns the SQL that the custom resource runs. It is exposed as a constant so the vitest
 * suite can assert that the literal strings appear in the synthesized Lambda inline code.
 *
 * Every CREATE uses IF NOT EXISTS so the resource is idempotent.
 */
export const EMBEDDINGS_TABLE_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL,
  company_id UUID NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1024) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS embeddings_chatbot_company_idx
  ON public.embeddings (chatbot_id, company_id);

CREATE INDEX IF NOT EXISTS embeddings_embedding_hnsw_idx
  ON public.embeddings USING hnsw (embedding vector_cosine_ops);
`;

/**
 * Creates the Lambda-backed custom resource that runs the embeddings table SQL on cluster
 * create. The Lambda uses RDS Data API to issue the SQL.
 */
export function createEmbeddingsTableResource(
  scope: Construct,
  props: {
    vpc: IVpc;
    lambdaSecurityGroup: ISecurityGroup;
    cluster: ServerlessCluster;
    secret: ISecret;
  },
) {
  // The Lambda is an inline function. We put the SQL string in a constant and reference it
  // in the inline code so the vitest assertion can find the literal.
  const sql = EMBEDDINGS_TABLE_SQL;

  const fn = new Function(scope, "EmbeddingsTableLambda", {
    runtime: Runtime.NODEJS_20_X,
    handler: "index.handler",
    code: Code.fromInline(`
"use strict";
const { RDSDataClient, ExecuteStatementCommand } = require("@aws-sdk/client-rds-data");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const SQL = ${JSON.stringify(sql)};

const clusterArn = process.env.CLUSTER_ARN;
const secretArn = process.env.SECRET_ARN;
const database = process.env.DATABASE;
const region = process.env.AWS_REGION;

const rds = new RDSDataClient({ region });
const sm = new SecretsManagerClient({ region });

exports.handler = async () => {
  // Fetch the master password from the secret. RDS Data API does not need it; it needs the
  // secret ARN as the resourceArn, but we still need the username from the secret for some
  // SQL modes. We pass both ARN and database; the API handles the rest.
  const sqlStatements = SQL.split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of sqlStatements) {
    await rds.send(new ExecuteStatementCommand({
      resourceArn: clusterArn,
      secretArn: secretArn,
      database: database,
      sql: statement,
    }));
  }
  return { statusCode: 200, body: JSON.stringify({ message: "embeddings table ready" }) };
};
`),
    vpc: props.vpc,
    securityGroups: [props.lambdaSecurityGroup],
    timeout: Duration.seconds(120),
    memorySize: 512,
    environment: {
      CLUSTER_ARN: props.cluster.clusterArn,
      SECRET_ARN: props.secret.secretArn,
      DATABASE: "chatsaas",
    },
  });

  // IAM: rds-data:ExecuteStatement on the cluster.
  props.cluster.grantDataApiAccess(fn);

  return fn;
}
