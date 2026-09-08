import { Duration } from "aws-cdk-lib";
import type { IBucket } from "aws-cdk-lib/aws-s3";
import type { IFunction } from "aws-cdk-lib/aws-lambda";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { Rule } from "aws-cdk-lib/aws-events";
import type { IQueue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

/**
 * EventBridge rule that fires the IngestLambda on every `s3:ObjectCreated:Put`
 * against the documents bucket. The Lambda re-validates the tenant and the
 * Document row; events that fail validation log and exit.
 *
 * Retry policy: 3 attempts at the EventBridge target layer. Bedrock throttling
 * is handled by the Lambda's own backoff loop (5 attempts, base 200 ms, cap 5 s).
 */
export interface IngestEventBridgeRuleConstructProps {
  readonly documentsBucket: IBucket;
  readonly ingestLambda: IFunction;
  readonly dlq: IQueue;
  readonly envName: "dev" | "prod";
}

export class IngestEventBridgeRuleConstruct extends Construct {
  public readonly rule: Rule;

  constructor(scope: Construct, id: string, props: IngestEventBridgeRuleConstructProps) {
    super(scope, id);

    this.rule = new Rule(this, "Rule", {
      ruleName: `chatsaas-${props.envName}-ingest-rule`,
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: {
          bucket: { name: [props.documentsBucket.bucketName] },
          object: { key: [{ prefix: "" }] },
        },
      },
      targets: [
        new LambdaFunction(props.ingestLambda, {
          deadLetterQueue: props.dlq,
          retryAttempts: 3,
          maxEventAge: Duration.hours(24),
        }),
      ],
    });
  }
}
