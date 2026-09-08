import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { CognitoUserPoolConstruct } from "./cognito-user-pool.js";
import { DocumentsBucketConstruct } from "./ingest-bucket.js";
import { DocumentsTableConstruct } from "./documents-table.js";
import { IngestLambdaConstruct } from "./ingest-lambda.js";
import { IngestEventBridgeRuleConstruct } from "./ingest-eventbridge-rule.js";
import { Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";

/**
 * The chatSaaS dev stack: Neon pgvector vector store (external, ADR-008) +
 * ingest pipeline (S3 -> EventBridge -> Lambda -> Bedrock + Neon) + Cognito
 * identity. Lambdas run outside any VPC; the Neon connection string is read at
 * runtime from the `chatsaas-{env}-neon-url` SSM SecureString.
 *
 * The embeddings schema is applied by `infra/db/migrations/` (see
 * infra/README.md), not by a CDK custom resource.
 */
export class ChatSaaSStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const envName = (this.node.tryGetContext("envName") as string) ?? "dev";

    // Neon URL parameter. The connection string itself is stored out-of-band
    // (see infra/README.md runbook); the stack only references the name.
    const neonUrlParameterName = `chatsaas-${envName}-neon-url`;

    // Stack outputs.
    new CfnOutput(this, "NeonUrlParameterName", {
      value: neonUrlParameterName,
      exportName: `${this.stackName}:NeonUrlParameterName`,
    });
    new CfnOutput(this, "EmbeddingsTableName", {
      value: "public.embeddings",
      exportName: `${this.stackName}:EmbeddingsTableName`,
    });

    // Identity stack (WI-008). Same Stack as the data plane for MVP; a
    // follow-up WI splits them when the API stack joins. The four CfnOutputs
    // (UserPoolId, UserPoolClientId, UserPoolDomain, IssuerUrl) are emitted by
    // the construct.
    new CognitoUserPoolConstruct(this, "Identity", {
      envName: envName as "dev" | "prod",
      cognitoDomainPrefix: "chatsaas-dev",
      callbackUrls: {
        dev: ["http://localhost:3000/callback"],
        prod: [],
      },
      signOutUrls: {
        dev: ["http://localhost:3000/"],
        prod: [],
      },
      adminAllowlist: [],
      mfaMode: "optional",
      advancedSecurityMode: "audit",
      region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
    });

    // WI-005: ingest pipeline (S3 -> EventBridge -> Lambda -> Bedrock + Neon).

    // DLQ for terminal ingest failures.
    const ingestDlq = new Queue(this, "IngestDlq", {
      queueName: `chatsaas-${envName}-ingest-dlq`,
      encryption: QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
    });

    const documentsBucket = new DocumentsBucketConstruct(this, "Documents", {
      envName: envName as "dev" | "prod",
    });

    const documentsTable = new DocumentsTableConstruct(this, "DocumentsTable", {
      envName: envName as "dev" | "prod",
    });

    const ingestLambda = new IngestLambdaConstruct(this, "Ingest", {
      envName: envName as "dev" | "prod",
      documentsBucket: documentsBucket.bucket,
      documentsTable: documentsTable.table,
      neonUrlParameterName,
      dlq: ingestDlq,
    });

    new IngestEventBridgeRuleConstruct(this, "IngestEventRule", {
      documentsBucket: documentsBucket.bucket,
      ingestLambda: ingestLambda.function,
      dlq: ingestDlq,
      envName: envName as "dev" | "prod",
    });

    // WI-005 stack outputs.
    new CfnOutput(this, "DocumentsBucketName", {
      value: documentsBucket.bucket.bucketName,
      exportName: `${this.stackName}:DocumentsBucketName`,
    });
    new CfnOutput(this, "DocumentsTableName", {
      value: documentsTable.table.tableName,
      exportName: `${this.stackName}:DocumentsTableName`,
    });
    new CfnOutput(this, "IngestLambdaName", {
      value: ingestLambda.function.functionName,
      exportName: `${this.stackName}:IngestLambdaName`,
    });
    new CfnOutput(this, "IngestDlqUrl", {
      value: ingestDlq.queueUrl,
      exportName: `${this.stackName}:IngestDlqUrl`,
    });
  }
}
