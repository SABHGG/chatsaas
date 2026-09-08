import { RemovalPolicy } from "aws-cdk-lib";
import { AttributeType, Table, BillingMode } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export interface DocumentsTableConstructProps {
  readonly envName: "dev" | "prod";
  readonly tableName?: string;
}

/**
 * The DocumentsTable stores one row per uploaded document. The row is the
 * authoritative source for the document's `(chatbotId, companyId, ownerSub,
 * status)` and is the bridge between the admin upload surface and the
 * IngestLambda triggered by S3 ObjectCreated events.
 *
 * PK: `id` (UUID). Status transitions are guarded by ConditionExpressions in
 * the IngestLambda, so the table is the linearization point for retries.
 */
export class DocumentsTableConstruct extends Construct {
  public readonly table: Table;
  public readonly tableName: string;

  constructor(scope: Construct, id: string, props: DocumentsTableConstructProps) {
    super(scope, id);

    this.table = new Table(this, "Resource", {
      tableName: props.tableName ?? `chatsaas-${props.envName}-documents`,
      partitionKey: { name: "id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: props.envName === "prod",
      removalPolicy:
        props.envName === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    this.tableName = this.table.tableName;
  }
}
