import { CfnOutput, CustomResource, Duration, Stack, StackProps } from "aws-cdk-lib";
import { Provider } from "aws-cdk-lib/custom-resources";
import { SubnetSelection } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { lookupVpc } from "./vpc.js";
import { createSecurityGroups } from "./security-groups.js";
import { createDatabaseSecret, createRotationLambda } from "./database-secret.js";
import { createAuroraPgVector } from "./aurora-pgvector.js";
import { createRdsProxy } from "./rds-proxy.js";
import { createEmbeddingsTableResource } from "./embeddings-table-resource.js";
import { CognitoUserPoolConstruct } from "./cognito-user-pool.js";
import { DocumentsBucketConstruct } from "./ingest-bucket.js";
import { DocumentsTableConstruct } from "./documents-table.js";
import { IngestLambdaConstruct } from "./ingest-lambda.js";
import { IngestEventBridgeRuleConstruct } from "./ingest-eventbridge-rule.js";
import { EmbeddingsUniqueIndexConstruct } from "./ingest-embeddings-index.js";
import { Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";

/**
 * The chatSaaS dev stack: Aurora Serverless v2 + pgvector + RDS Proxy + Secrets Manager + the
 * `public.embeddings` custom resource + a 7-day rotation hook.
 *
 * The stack can be synthesized locally without AWS by passing a `vpc` context block:
 *
 *   cdk synth -c vpc:vpcId=vpc-12345 \
 *             -c vpc:privateSubnetIds=subnet-1,subnet-2 \
 *             -c vpc:availabilityZones=us-east-1a,us-east-1b
 */
export class ChatSaaSStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const envName = (this.node.tryGetContext("envName") as string) ?? "dev";
    const databaseName = "chatsaas";

    const vpc = lookupVpc(this);

    const { lambdaSg, proxySg, clusterSg } = createSecurityGroups(this, vpc);

    const secret = createDatabaseSecret(this, { envName });

    // Rotation Lambda. The hook is a no-op for MVP.
    const rotationFn = createRotationLambda(this, {
      secret,
      vpc,
      rotationSecurityGroup: lambdaSg,
    });
    secret.addRotationSchedule("DailyCheck", {
      automaticallyAfter: Duration.days(7),
      rotationLambda: rotationFn,
    });

    // Subnet selection. When the VPC was passed via context (local synth / tests), we use
    // explicit subnet IDs. Otherwise we let the default VPC's private subnets drive the
    // selection.
    const vpcId = this.node.tryGetContext("vpcId") as string | undefined;
    const privateSubnetIdsRaw = this.node.tryGetContext("privateSubnetIds") as string | undefined;
    const ctx = vpcId && privateSubnetIdsRaw
      ? { privateSubnetIds: privateSubnetIdsRaw.split(",").map((s) => s.trim()) }
      : undefined;

    const subnetSelection: SubnetSelection = ctx
      ? { subnetIds: ctx.privateSubnetIds }
      : vpc.selectSubnets({ subnetType: vpc.privateSubnets[0]?.subnetType ?? undefined });

    // Aurora cluster with `vector` preloaded.
    const { cluster } = createAuroraPgVector(this, {
      vpc,
      subnetSelection,
      clusterSecurityGroup: clusterSg,
      secret,
      databaseName,
    });

    // RDS Proxy.
    // TODO(WI-004 follow-up): ServerlessCluster.engine is not exposed on this CDK version
    // (2.266.0), so ProxyTarget.bind throws `CouldNotDetermineEngineForProxyTarget` at synth
    // time. The proper fix is either to switch to a provisioned `DatabaseCluster` for
    // proxy compatibility or to wire direct RDS Data API for Lambdas and skip the proxy in
    // MVP. Out of scope for WI-008; tracked separately.
    const skipProxy = this.node.tryGetContext("skipProxy") === "true";
    let proxy: ReturnType<typeof createRdsProxy> | undefined;
    if (!skipProxy) {
      proxy = createRdsProxy(this, {
        cluster,
        secret,
        vpc,
        proxySecurityGroup: proxySg,
        clusterSecurityGroup: clusterSg,
        subnetSelection,
      });
    }

    // Custom resource: embeddings table + HNSW.
    const embeddingsLambda = createEmbeddingsTableResource(this, {
      vpc,
      lambdaSecurityGroup: lambdaSg,
      cluster,
      secret,
    });

    const provider = new Provider(this, "EmbeddingsProvider", {
      onEventHandler: embeddingsLambda,
    });

    new CustomResource(this, "EmbeddingsTable", {
      serviceToken: provider.serviceToken,
    });

    // Stack outputs.
    new CfnOutput(this, "ClusterEndpoint", {
      value: cluster.clusterEndpoint.hostname,
      exportName: `${this.stackName}:ClusterEndpoint`,
    });
    new CfnOutput(this, "ClusterArn", {
      value: cluster.clusterArn,
      exportName: `${this.stackName}:ClusterArn`,
    });
    if (proxy) {
      new CfnOutput(this, "ProxyEndpoint", {
        value: proxy.endpoint,
        exportName: `${this.stackName}:ProxyEndpoint`,
      });
      new CfnOutput(this, "ProxyArn", {
        value: proxy.dbProxyArn,
        exportName: `${this.stackName}:ProxyArn`,
      });
    }
    new CfnOutput(this, "SecretArn", {
      value: secret.secretArn,
      exportName: `${this.stackName}:SecretArn`,
    });
    new CfnOutput(this, "DatabaseName", {
      value: databaseName,
      exportName: `${this.stackName}:DatabaseName`,
    });
    new CfnOutput(this, "EmbeddingsTableName", {
      value: "public.embeddings",
      exportName: `${this.stackName}:EmbeddingsTableName`,
    });

    // Identity stack (WI-008). Same Stack as the Aurora resources for MVP; a follow-up
    // WI splits them when the API stack joins. The four CfnOutputs (UserPoolId,
    // UserPoolClientId, UserPoolDomain, IssuerUrl) are emitted by the construct.
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

        // WI-005: ingest pipeline (S3 -> EventBridge -> Lambda -> Bedrock + pgvector).

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

        // Custom resource: add content_sha256 + unique (chatbot_id, content_sha256) to
        // public.embeddings, then ANALYZE. This runs before the IngestLambda can fire.
        const documentsIndex = new EmbeddingsUniqueIndexConstruct(this, "EmbeddingsUniqueIndex", {
          vpc,
          lambdaSecurityGroup: lambdaSg,
          cluster,
          secret,
          databaseName,
        });

        const ingestLambda = new IngestLambdaConstruct(this, "Ingest", {
          envName: envName as "dev" | "prod",
          documentsBucket: documentsBucket.bucket,
          documentsTable: documentsTable.table,
          dbSecret: secret,
          dbClusterArn: cluster.clusterArn,
          dbName: databaseName,
          vpc,
          lambdaSecurityGroup: lambdaSg,
          dlq: ingestDlq,
          documentsIndexResource: documentsIndex.resource,
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
