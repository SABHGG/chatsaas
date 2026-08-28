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
    const proxy = createRdsProxy(this, {
      cluster,
      secret,
      vpc,
      proxySecurityGroup: proxySg,
      clusterSecurityGroup: clusterSg,
      subnetSelection,
    });

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
    new CfnOutput(this, "ProxyEndpoint", {
      value: proxy.endpoint,
      exportName: `${this.stackName}:ProxyEndpoint`,
    });
    new CfnOutput(this, "ProxyArn", {
      value: proxy.dbProxyArn,
      exportName: `${this.stackName}:ProxyArn`,
    });
    new CfnOutput(this, "SecretArn", {
      value: secret.secretArn,
      exportName: `${this.stackName}:SecretArn`,
    });
    new CfnOutput(this, "DatabaseName", {
      value: databaseName,
      exportName: `${this.stackName}:DatabaseName`,
    });
    new CfnOutput(this, "EmbeddingsTable", {
      value: "public.embeddings",
      exportName: `${this.stackName}:EmbeddingsTable`,
    });
  }
}
