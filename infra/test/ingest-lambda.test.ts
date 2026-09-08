import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";
import { describe, it, expect } from "vitest";
import { IngestLambdaConstruct } from "../lib/ingest-lambda";

function makeStack() {
  const app = new App();
  const stack = new Stack(app, "TestStack", {
    env: { region: "us-east-1", account: "111111111111" },
  });
  const bucket = new Bucket(stack, "Bucket");
  const docsTable = new Table(stack, "Docs", {
    partitionKey: { name: "id", type: "S" as any },
  });
  const dlq = new Queue(stack, "Dlq", { encryption: QueueEncryption.SQS_MANAGED });
  return { stack, bucket, docsTable, dlq };
}

function makeIngest(ctx: ReturnType<typeof makeStack>) {
  return new IngestLambdaConstruct(ctx.stack, "Ingest", {
    envName: "dev",
    documentsBucket: ctx.bucket,
    documentsTable: ctx.docsTable,
    neonUrlParameterName: "chatsaas-dev-neon-url",
    dlq: ctx.dlq,
  });
}

function ingestFunction(template: Template) {
  const lambdas = Object.values(template.findResources("AWS::Lambda::Function")) as any[];
  const ingest = lambdas.find(
    (l) => l.Properties.Runtime === "nodejs20.x" && l.Properties.Timeout === 300,
  );
  expect(ingest).toBeDefined();
  return ingest!;
}

describe("IngestLambdaConstruct", () => {
  it("creates a Node 20 Lambda with 1024 MB, 5-min timeout, and DLQ", () => {
    const ctx = makeStack();
    makeIngest(ctx);

    const template = Template.fromStack(ctx.stack);
    // The ingest function + the log-retention custom resource Lambda.
    template.resourceCountIs("AWS::Lambda::Function", 2);
    const ingest = ingestFunction(template);
    expect(ingest.Properties.MemorySize).toBe(1024);
    expect(ingest.Properties.DeadLetterConfig).toEqual({
      TargetArn: { "Fn::GetAtt": [expect.stringMatching(/^Dlq/), "Arn"] },
    });
  });

  it("runs outside any VPC: no VpcConfig and no security groups", () => {
    const ctx = makeStack();
    makeIngest(ctx);

    const template = Template.fromStack(ctx.stack);
    const ingest = ingestFunction(template);
    expect(ingest.Properties.VpcConfig).toBeUndefined();
    // No VPC/EC2 data-plane resources at all.
    template.resourceCountIs("AWS::EC2::VPC", 0);
    template.resourceCountIs("AWS::EC2::SecurityGroup", 0);
    template.resourceCountIs("AWS::EC2::Subnet", 0);
  });

  it("declares the required env vars including the Neon URL parameter name", () => {
    const ctx = makeStack();
    makeIngest(ctx);

    const template = Template.fromStack(ctx.stack);
    const ingest = ingestFunction(template);
    const env = ingest.Properties.Environment.Variables;
    expect(env.DOCUMENTS_BUCKET).toBeDefined();
    expect(env.DOCUMENTS_TABLE).toBeDefined();
    expect(env.NEON_URL_PARAMETER_NAME).toBe("chatsaas-dev-neon-url");
    expect(env.BEDROCK_EMBED_MODEL_ID).toBe("amazon.titan-embed-text-v2:0");
    expect(env.BEDROCK_REGION).toBe("us-east-1");
    expect(env.CHUNK_SIZE).toBe("1000");
    expect(env.CHUNK_OVERLAP).toBe("200");
    // Aurora-era env vars are gone.
    expect(env.DB_SECRET_ARN).toBeUndefined();
    expect(env.DB_CLUSTER_ARN).toBeUndefined();
    expect(env.DB_NAME).toBeUndefined();
  });

  it("grants Bedrock InvokeModel on the Titan v2 model ARN only", () => {
    const ctx = makeStack();
    makeIngest(ctx);

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

  it("grants ssm:GetParameter scoped to the Neon URL parameter only", () => {
    const ctx = makeStack();
    makeIngest(ctx);

    const template = Template.fromStack(ctx.stack);
    const policies = Object.values(template.findResources("AWS::IAM::Policy")) as any[];
    const ssmPolicy = policies.find((p) =>
      JSON.stringify(p.Properties.PolicyDocument).includes("ssm:GetParameter"),
    );
    expect(ssmPolicy).toBeDefined();
    const ssmStmt = ssmPolicy.Properties.PolicyDocument.Statement.find((s: any) =>
      Array.isArray(s.Action) ? s.Action.includes("ssm:GetParameter") : s.Action === "ssm:GetParameter",
    );
    expect(ssmStmt).toBeDefined();
    expect([ssmStmt.Resource].flat()).toEqual([
      "arn:aws:ssm:us-east-1:111111111111:parameter/chatsaas-dev-neon-url",
    ]);
  });

  it("grants no RDS Data API or Secrets Manager access", () => {
    const ctx = makeStack();
    makeIngest(ctx);

    const template = Template.fromStack(ctx.stack);
    const policyJson = JSON.stringify(template.findResources("AWS::IAM::Policy"));
    expect(policyJson).not.toContain("rds-data:");
    expect(policyJson).not.toContain("secretsmanager:");
    // And no Aurora-era resources anywhere in the template.
    template.resourceCountIs("AWS::RDS::DBCluster", 0);
    template.resourceCountIs("AWS::RDS::DBProxy", 0);
    template.resourceCountIs("AWS::SecretsManager::Secret", 0);
  });

  it("grants S3 read on the documents bucket and scoped DynamoDB/SQS actions", () => {
    const ctx = makeStack();
    makeIngest(ctx);

    const template = Template.fromStack(ctx.stack);
    const policyJson = JSON.stringify(template.findResources("AWS::IAM::Policy"));
    expect(policyJson).toContain("s3:GetObject*");
    expect(policyJson).toContain("dynamodb:GetItem");
    expect(policyJson).toContain("dynamodb:UpdateItem");
    expect(policyJson).toContain("sqs:SendMessage");
  });
});
