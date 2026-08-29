import { describe, it, expect } from "vitest";
import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Vpc, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { ServerlessCluster, DatabaseClusterEngine, AuroraPostgresEngineVersion } from "aws-cdk-lib/aws-rds";
import { CustomResource } from "aws-cdk-lib/core";
import { EmbeddingsUniqueIndexConstruct, EMBEDDINGS_UNIQUE_INDEX_SQL } from "../lib/ingest-embeddings-index.js";

function makeStack() {
  const app = new App();
  const stack = new Stack(app, "Test", {
    env: { account: "111111111111", region: "us-east-1" },
  });
  const vpc = Vpc.fromVpcAttributes(stack, "V", {
    vpcId: "vpc-1",
    availabilityZones: ["us-east-1a"],
    privateSubnetIds: ["subnet-1"],
  });
  const sg = new SecurityGroup(stack, "SG", { vpc, description: "i" });
  const secret = new Secret(stack, "DbSecret");
  // Bypass real cluster creation by using fromClusterAttributes would be ideal; but the
  // construct reads `clusterArn` and calls `grantDataApiAccess`, which require either
  // a ServerlessCluster instance or an IClusterRef. Use a placeholder ref via a
  // minimal ServerlessCluster would require a real engine. Instead we mock the dependency
  // by stubbing clusterArn.
  // Use a real ServerlessCluster in the test (it does not need a real engine
  // for grantDataApiAccess to attach the right IAM resource on the construct).
  const cluster = new ServerlessCluster(stack, "C", {
    engine: DatabaseClusterEngine.auroraPostgres({ version: AuroraPostgresEngineVersion.VER_15_5 }),
    vpc,
    clusterIdentifier: "test-cluster",
    credentials: { username: "postgres" },
  });
  return { stack, vpc, sg, secret, cluster };
}

describe("EmbeddingsUniqueIndexConstruct", () => {
  it("exposes the SQL as a constant for the assertion suite", () => {
    expect(EMBEDDINGS_UNIQUE_INDEX_SQL).toContain(
      "ALTER TABLE IF EXISTS public.embeddings ADD COLUMN IF NOT EXISTS content_sha256 BYTEA",
    );
    expect(EMBEDDINGS_UNIQUE_INDEX_SQL).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS embeddings_chatbot_content_sha256_idx",
    );
    expect(EMBEDDINGS_UNIQUE_INDEX_SQL).toContain("ON public.embeddings (chatbot_id, content_sha256)");
    expect(EMBEDDINGS_UNIQUE_INDEX_SQL).toContain("ANALYZE public.embeddings");
  });

  it("creates a Node 20 Lambda and a CustomResource backed by it", () => {
    const ctx = makeStack();
    new EmbeddingsUniqueIndexConstruct(ctx.stack, "Index", {
      cluster: ctx.cluster,
      secret: ctx.secret,
      databaseName: "chatsaas",
      vpc: ctx.vpc,
      lambdaSecurityGroup: ctx.sg,
    });

    const template = Template.fromStack(ctx.stack);
    // The provider's framework Lambda + the onEventHandler Lambda both show up.
    const fns = Object.values(template.findResources("AWS::Lambda::Function")) as any[];
    expect(fns.length).toBeGreaterThanOrEqual(1);
    expect(fns.some((f) => f.Properties.Runtime === "nodejs20.x")).toBe(true);
    template.resourceCountIs("AWS::CloudFormation::CustomResource", 1);
  });

  it("embeds the SQL in the inline Lambda code", () => {
    const ctx = makeStack();
    new EmbeddingsUniqueIndexConstruct(ctx.stack, "Index", {
      cluster: ctx.cluster,
      secret: ctx.secret,
      databaseName: "chatsaas",
      vpc: ctx.vpc,
      lambdaSecurityGroup: ctx.sg,
    });

    const template = Template.fromStack(ctx.stack);
    const lambdas = Object.values(template.findResources("AWS::Lambda::Function")) as any[];
    const code = (lambdas.find((l) => l.Properties.Code?.ZipFile) as any).Properties.Code.ZipFile;
    expect(code).toContain("content_sha256 BYTEA");
    expect(code).toContain("embeddings_chatbot_content_sha256_idx");
    expect(code).toContain("ANALYZE public.embeddings");
  });

  it("adds the dependency if supplied", () => {
    const ctx = makeStack();
    const dep = new CustomResource(ctx.stack, "Dep", {
      serviceToken: "arn:aws:lambda:us-east-1:111111111111:function:placeholder",
    });
    new EmbeddingsUniqueIndexConstruct(ctx.stack, "Index", {
      cluster: ctx.cluster,
      secret: ctx.secret,
      databaseName: "chatsaas",
      vpc: ctx.vpc,
      lambdaSecurityGroup: ctx.sg,
      dependencies: [dep],
    });
    const template = Template.fromStack(ctx.stack);
    const crs = Object.values(template.findResources("AWS::CloudFormation::CustomResource")) as any[];
    // The new CR (Index) should depend on the dependency (Dep).
    const index = crs.find((c) => c.DependsOn && JSON.stringify(c.DependsOn).includes("Dep"));
    expect(index).toBeDefined();
  });
});
