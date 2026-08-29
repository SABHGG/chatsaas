import { describe, it, expect } from "vitest";
import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";
import { Function, Runtime, Code } from "aws-cdk-lib/aws-lambda";
import { IngestEventBridgeRuleConstruct } from "../lib/ingest-eventbridge-rule.js";

function makeStack() {
  const app = new App();
  const stack = new Stack(app, "Test", {
    env: { account: "111111111111", region: "us-east-1" },
  });
  const bucket = new Bucket(stack, "Bucket", { bucketName: "test-bucket" });
  const fn = new Function(stack, "F", {
    runtime: Runtime.NODEJS_20_X,
    handler: "h.handler",
    code: Code.fromInline("export const handler = async () => ({});"),
  });
  const dlq = new Queue(stack, "Dlq", { encryption: QueueEncryption.SQS_MANAGED });
  return { stack, bucket, fn, dlq };
}

describe("IngestEventBridgeRuleConstruct", () => {
  it("creates a single rule with the s3 Object Created event pattern", () => {
    const ctx = makeStack();
    new IngestEventBridgeRuleConstruct(ctx.stack, "Rule", {
      documentsBucket: ctx.bucket,
      ingestLambda: ctx.fn,
      dlq: ctx.dlq,
      envName: "dev",
    });

    const template = Template.fromStack(ctx.stack);
    template.resourceCountIs("AWS::Events::Rule", 1);
    template.hasResourceProperties("AWS::Events::Rule", {
      Name: "chatsaas-dev-ingest-rule",
      EventPattern: {
        "source": ["aws.s3"],
        "detail-type": ["Object Created"],
        "detail": {
          bucket: { name: [{ Ref: "Bucket83908E77" }] },
          object: { key: [{ prefix: "" }] },
        },
      },
    });
  });

  it("targets the Lambda with a DLQ and 3 retry attempts", () => {
    const ctx = makeStack();
    new IngestEventBridgeRuleConstruct(ctx.stack, "Rule", {
      documentsBucket: ctx.bucket,
      ingestLambda: ctx.fn,
      dlq: ctx.dlq,
      envName: "dev",
    });

    const template = Template.fromStack(ctx.stack);
    const rules = Object.values(template.findResources("AWS::Events::Rule")) as any[];
    expect(rules).toHaveLength(1);
    const target = rules[0].Properties.Targets[0];
    // Lambda arn resolves to a {Fn::GetAttr} with the function's logical id.
    expect(target.Arn).toBeDefined();
    expect(target.RetryPolicy).toEqual({
      MaximumRetryAttempts: 3,
      MaximumEventAgeInSeconds: 86400,
    });
    expect(target.DeadLetterConfig).toBeDefined();
  });

  it("uses the env name in the rule name (prod)", () => {
    const ctx = makeStack();
    new IngestEventBridgeRuleConstruct(ctx.stack, "Rule", {
      documentsBucket: ctx.bucket,
      ingestLambda: ctx.fn,
      dlq: ctx.dlq,
      envName: "prod",
    });

    const template = Template.fromStack(ctx.stack);
    template.hasResourceProperties("AWS::Events::Rule", {
      Name: "chatsaas-prod-ingest-rule",
    });
  });
});
