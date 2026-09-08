import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";
import { companiesTableArn } from "./lambda/companies-table.js";

/**
 * IAM policy builder for the post-confirmation Lambda.
 *
 * The Lambda needs:
 *   1. `dynamodb:PutItem` on the companies table (idempotent write).
 *   2. `cognito-idp:AdminUpdateUserAttributes` on the user pool.
 *
 * Both actions are scoped to specific resource ARNs, never wildcards.
 */
export function postConfirmationPolicyStatements(
  region: string,
  account: string,
  envName: string,
  userPoolArn: string,
): PolicyStatement[] {
  return [
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["dynamodb:PutItem"],
      resources: [companiesTableArn(region, account, envName)],
    }),
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["cognito-idp:AdminUpdateUserAttributes"],
      resources: [userPoolArn],
    }),
  ];
}
