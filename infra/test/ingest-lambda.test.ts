import { App, Stack, CustomResource } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";
import { SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import { describe, it, expect } from "vitest";
import { IngestLambdaConstruct } from "../lib/ingest-lambda";

function makeStack() {
  const app = new App();
  const stack = new Stack(app, "TestStack", {
    env: { region: "us-east-1", account: "111111111111" },
  });
  const vpc = new Vpc(stack, "Vpc", { maxAzs: 2 });
  const sg = new SecurityGroup(stack, "SG", { vpc, description: "ingest" });
  const bucket = new Bucket(stack, "Bucket");
  const docsTable = new Table(stack, "Docs", {
    partitionKey: { name: "id", type: "S" as any },
  });
  const secret = new Secret(stack, "DbSecret");
  const dlq = new Queue(stack, "Dlq", { encryption: QueueEncryption.SQS_MANAGED });
  const indexResource = new CustomResource(stack, "Index", {
    serviceToken: "arn:aws:lambda:us-east-1:111111111111:function:placeholder",
  });
  return {
    stack,
    vpc,
    sg,
    bucket,
    docsTable,
    secret,
    dlq,
    indexResource,
  };
}

describe("IngestLambdaConstruct", () => {
  it("creates a Node 20 Lambda with 1024 MB, 5-min timeout, and DLQ", () => {
    const ctx = makeStack();
    new IngestLambdaConstruct(ctx.stack, "Ingest", {
      envName: "dev",
      documentsBucket: ctx.bucket,
      documentsTable: ctx.docsTable,
      dbSecret: ctx.secret,
      dbClusterArn:
        "arn:aws:rds:us-east-1:111111111111:cluster:chatsaas-dev",
      dbName: "chatsaas",
      vpc: ctx.vpc,
      lambdaSecurityGroup: ctx.sg,
      dlq: ctx.dlq,
      documentsIndexResource: ctx.indexResource,
    });

    const template = Template.fromStack(ctx.stack);
    template.resourceCountIs("AWS::Lambda::Function", 2);
    const lambdas = Object.values(template.findResources("AWS::Lambda::Function")) as any[];
    const ingest = lambdas.find(
      (l) => l.Properties.Runtime === "nodejs20.x" && l.Properties.Timeout === 300,
    );
    expect(ingest).toBeDefined();
    expect(ingest!.Properties.MemorySize).toBe(1024);
    expect(ingest!.Properties.DeadLetterConfig).toEqual({
      TargetArn: { "Fn::GetAtt": [expect.stringMatching(/^Dlq/), "Arn"] },
    });
  });

  it("declares the required env vars", () => {
    const ctx = makeStack();
    new IngestLambdaConstruct(ctx.stack, "Ingest", {
      envName: "dev",
      documentsBucket: ctx.bucket,
      documentsTable: ctx.docsTable,
      dbSecret: ctx.secret,
      dbClusterArn:
        "arn:aws:rds:us-east-1:111111111111:cluster:chatsaas-dev",
      dbName: "chatsaas",
      vpc: ctx.vpc,
      lambdaSecurityGroup: ctx.sg,
      dlq: ctx.dlq,
      documentsIndexResource: ctx.indexResource,
    });

    const template = Template.fromStack(ctx.stack);
    const lambdas = Object.values(template.findResources("AWS::Lambda::Function")) as any[];
    const ingest = lambdas.find(
      (l) => l.Properties.Runtime === "nodejs20.x" && l.Properties.Timeout === 300,
    );
    const env = ingest!.Properties.Environment.Variables;
    expect(env.DOCUMENTS_BUCKET).toBeDefined();
    expect(env.DOCUMENTS_TABLE).toBeDefined();
    expect(env.DB_SECRET_ARN).toBeDefined();
    expect(env.DB_CLUSTER_ARN).toBeDefined();
    expect(env.DB_NAME).toBeDefined();
    expect(env.BEDROCK_EMBED_MODEL_ID).toBe("amazon.titan-embed-text-v2:0");
    expect(env.BEDROCK_REGION).toBe("us-east-1");
    expect(env.CHUNK_SIZE).toBe("1000");
    expect(env.CHUNK_OVERLAP).toBe("200");
  });

  it("grants Bedrock InvokeModel on the Titan v2 model ARN only", () => {
    const ctx = makeStack();
    new IngestLambdaConstruct(ctx.stack, "Ingest", {
      envName: "dev",
      documentsBucket: ctx.bucket,
      documentsTable: ctx.docsTable,
      dbSecret: ctx.secret,
      dbClusterArn:
        "arn:aws:rds:us-east-1:111111111111:cluster:chatsaas-dev",
      dbName: "chatsaas",
      vpc: ctx.vpc,
      lambdaSecurityGroup: ctx.sg,
      dlq: ctx.dlq,
      documentsIndexResource: ctx.indexResource,
    });

    const template = Template.fromStack(ctx.stack);
    const policies = Object.values(template.findResources("AWS::IAM::Policy")) as any[];
    const bedrockPolicy = policies.find((p) =>
      JSON.stringify(p.Properties.PolicyDocument).includes("bedrock:InvokeModel"),
    );
    expect(bedrockPolicy).toBeDefined();
    const doc = bedrockPolicy.Properties.PolicyDocument;
    const bedrockStmt = doc.Statement.find((s: any) =>
      Array.isArray(s.Action) ? s.Action.includes("bedrock:InvokeModel") : s.Action === "bedrock:InvokeModel",
    );
    expect(bedrockStmt).toBeDefined();
    expect([bedrockStmt.Resource].flat()).toEqual([
      "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0",
    ]);
  });

  it("grants rds-data:ExecuteStatement on the cluster ARN only", () => {
    const ctx = makeStack();
    new IngestLambdaConstruct(ctx.stack, "Ingest", {
      envName: "dev",
      documentsBucket: ctx.bucket,
      documentsTable: ctx.docsTable,
      dbSecret: ctx.secret,
      dbClusterArn:
        "arn:aws:rds:us-east-1:111111111111:cluster:chatsaas-dev",
      dbName: "chatsaas",
      vpc: ctx.vpc,
      lambdaSecurityGroup: ctx.sg,
      dlq: ctx.dlq,
      documentsIndexResource: ctx.indexResource,
    });

    const template = Template.fromStack(ctx.stack);
    const policies = Object.values(template.findResources("AWS::IAM::Policy")) as any[];
    const dataApiPolicy = policies.find((p) =>
      JSON.stringify(p.Properties.PolicyDocument).includes("rds-data:ExecuteStatement"),
    );
    expect(dataApiPolicy).toBeDefined();
    const dataApiStmt = dataApiPolicy.Properties.PolicyDocument.Statement.find((s: any) =>
      Array.isArray(s.Action) ? s.Action.includes("rds-data:ExecuteStatement") : s.Action === "rds-data:ExecuteStatement",
    );
    expect(dataApiStmt).toBeDefined();
    expect([dataApiStmt.Resource].flat()).toEqual([
      "arn:aws:rds:us-east-1:111111111111:cluster:chatsaas-dev",
    ]);
  });

  it("depends on the documentsIndexResource (runs after the SQL migration)", () => {
    const ctx = makeStack();
    new IngestLambdaConstruct(ctx.stack, "Ingest", {
      envName: "dev",
      documentsBucket: ctx.bucket,
      documentsTable: ctx.docsTable,
      dbSecret: ctx.secret,
      dbClusterArn:
        "arn:aws:rds:us-east-1:111111111111:cluster:chatsaas-dev",
      dbName: "chatsaas",
      vpc: ctx.vpc,
      lambdaSecurityGroup: ctx.sg,
      dlq: ctx.dlq,
      documentsIndexResource: ctx.indexResource,
    });
    const template = Template.fromStack(ctx.stack);
    const lambdas = Object.values(template.findResources("AWS::Lambda::Function")) as any[];
    const ingest = lambdas.find(
      (l) => l.Properties.Runtime === "nodejs20.x" && l.Properties.Timeout === 300,
    );
    expect(ingest!.DependsOn).toBeDefined();
    // Index must appear in the dependency list of the Ingest Lambda.
    expect(ingest!.DependsOn).toEqual(expect.arrayContaining([expect.stringMatching(/Index/)]));
  });
});
