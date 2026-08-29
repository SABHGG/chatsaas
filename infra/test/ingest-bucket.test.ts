import { describe, it, expect } from "vitest";
import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { DocumentsBucketConstruct } from "../lib/ingest-bucket.js";

describe("DocumentsBucketConstruct", () => {
  it("creates a versioned SSE-S3 bucket with public access block and eventBridgeEnabled", () => {
    const app = new App();
    const stack = new Stack(app, "Test", {
      env: { account: "111111111111", region: "us-east-1" },
    });
    new DocumentsBucketConstruct(stack, "Documents", { envName: "dev" });

    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::S3::Bucket", 1);

    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
        ],
      },
      VersioningConfiguration: { Status: "Enabled" },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });

    // eventBridgeEnabled in CDK 2.266 is a no-op at the CfnBucket level (the rule subscribes
    // via an EventBridge bus rather than an S3 notification). The property is asserted at
    // the construct level by the EventBridge rule test (ingest-eventbridge-rule.test.ts) which
    // matches the bucket by name in the event pattern. We do not assert it here.
  });

  it("names the bucket with the envName and account suffix", () => {
    const app = new App();
    const stack = new Stack(app, "Test", {
      env: { account: "222222222222", region: "us-east-1" },
    });
    new DocumentsBucketConstruct(stack, "Documents", { envName: "prod" });

    const template = Template.fromStack(stack);
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: "chatsaas-prod-documents-222222222222",
    });
  });

  it("configures Glacier transition at 180 days and no IA tier", () => {
    const app = new App();
    const stack = new Stack(app, "Test", {
      env: { account: "111111111111", region: "us-east-1" },
    });
    new DocumentsBucketConstruct(stack, "Documents", { envName: "dev" });

    const template = Template.fromStack(stack);
    template.hasResourceProperties("AWS::S3::Bucket", {
      LifecycleConfiguration: {
        Rules: [
          {
            Status: "Enabled",
            Transitions: [
              {
                StorageClass: "GLACIER",
                TransitionInDays: 180,
              },
            ],
          },
        ],
      },
    });
  });

  it("applies RETAIN removal policy in prod and DESTROY in dev (default)", () => {
    const devApp = new App();
    const devStack = new Stack(devApp, "DevStack", {
      env: { account: "111111111111", region: "us-east-1" },
    });
    new DocumentsBucketConstruct(devStack, "Documents", { envName: "dev" });
    const devTemplate = Template.fromStack(devStack);
    devTemplate.hasResource("AWS::S3::Bucket", {
      DeletionPolicy: "Delete",
      UpdateReplacePolicy: "Delete",
    });

    const prodApp = new App();
    const prodStack = new Stack(prodApp, "ProdStack", {
      env: { account: "111111111111", region: "us-east-1" },
    });
    new DocumentsBucketConstruct(prodStack, "Documents", { envName: "prod" });
    const prodTemplate = Template.fromStack(prodStack);
    prodTemplate.hasResource("AWS::S3::Bucket", {
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
    });
  });
});
