import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  StorageClass,
} from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

/**
 * S3 bucket for customer-uploaded documents.
 *
 * Layout: `s3://<bucket>/<company_id>/<chatbot_id>/<document_id>/<filename>`.
 * The IngestLambda reads objects via `s3:GetObject`; the admin route writes them.
 * No bucket policy is attached: the IngestLambda IAM (see `ingest-lambda.ts`) is the
 * only path in. Cross-account reads are denied by `blockPublicAccess` + `enforceSSL`.
 *
 * EventBridge is enabled so the EventBridge rule (`ingest-eventbridge-rule.ts`) can
 * subscribe to `s3:ObjectCreated:Put` on the bucket.
 */
export interface DocumentsBucketConstructProps {
  readonly envName: "dev" | "prod";
  readonly removalPolicy?: RemovalPolicy;
}

export class DocumentsBucketConstruct extends Construct {
  public readonly bucket: Bucket;
  public readonly bucketName: string;

  constructor(scope: Construct, id: string, props: DocumentsBucketConstructProps) {
    super(scope, id);

    const stack = Stack.of(this);
    const account = stack.account;
    const suffix = account ? `-${account}` : "";
    const bucketName = `chatsaas-${props.envName}-documents${suffix}`;

    this.bucket = new Bucket(this, "DocumentsBucket", {
      bucketName,
      encryption: BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      eventBridgeEnabled: true,
      removalPolicy: props.removalPolicy ??
        (props.envName === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY),
      autoDeleteObjects: props.envName !== "prod",
      lifecycleRules: [
        {
          // Cold docs are rarely re-embedded; jump straight to Glacier after 180 d.
          enabled: true,
          transitions: [
            {
              storageClass: StorageClass.GLACIER,
              transitionAfter: Duration.days(180),
            },
          ],
        },
      ],
    });

    this.bucketName = this.bucket.bucketName;
  }
}
