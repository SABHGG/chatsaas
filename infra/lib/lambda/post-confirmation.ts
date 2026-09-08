import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { v4 as uuidv4 } from "uuid";
import type {
  PostConfirmationTriggerEvent,
  PostConfirmationTriggerHandler,
} from "aws-lambda";

/**
 * Post-confirmation Lambda for the Cognito User Pool.
 *
 * Trigger: `PostConfirmation_ConfirmSignUp`.
 *
 * Responsibilities:
 *   1. Generate a UUID v4 for the new Company.
 *   2. Write a Company record to DynamoDB (idempotent via ConditionExpression).
 *   3. Set `custom:company_id` on the user via `AdminUpdateUserAttributes`.
 *
 * The Lambda is the SOLE writer of `custom:company_id` server-side. This is the chain-of-custody
 * invariant closed by AC-13 + AC-14 in WI-008. The SignUp form cannot inject a `company_id`
 * because the User Pool Client's writeAttributes whitelist excludes the attribute (AC-13), and
 * no other IAM principal in the stack has `cognito-idp:AdminUpdateUserAttributes` (AC-14).
 *
 * Idempotency: a duplicate confirmation (e.g. re-sending the verification code) hits the
 * `ConditionalCheckFailedException` and the Lambda exits without re-calling
 * `AdminUpdateUserAttributes`.
 */

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});

const COMPANIES_TABLE_NAME = process.env.COMPANIES_TABLE_NAME;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

if (!COMPANIES_TABLE_NAME || !USER_POOL_ID) {
  throw new Error(
    "post-confirmation: missing required env vars COMPANIES_TABLE_NAME / COGNITO_USER_POOL_ID",
  );
}

type CompanyRecord = {
  id: string;
  ownerUserId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

async function createCompanyAndBindUser(
  sub: string,
  email: string,
): Promise<void> {
  const companyId = uuidv4();
  const now = new Date().toISOString();
  const companyName = (email.split("@")[0] ?? "My Company").trim() || "My Company";

  const record: CompanyRecord = {
    id: companyId,
    ownerUserId: sub,
    name: companyName,
    createdAt: now,
    updatedAt: now,
  };

  // Idempotent: a duplicate trigger event hits ConditionalCheckFailedException and we exit.
  try {
    await ddb.send(
      new PutCommand({
        TableName: COMPANIES_TABLE_NAME,
        Item: record,
        ConditionExpression: "attribute_not_exists(id)",
      }),
    );
  } catch (err) {
    const e = err as Error & { name?: string };
    if (e.name === "ConditionalCheckFailedException") {
      // Company already exists for this user; nothing to do.
      return;
    }
    throw err;
  }

  await cognito.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: sub,
      UserAttributes: [
        { Name: "custom:company_id", Value: companyId },
      ],
    }),
  );
}

export const handler: PostConfirmationTriggerHandler = async (
  event: PostConfirmationTriggerEvent,
) => {
  const sub = event.request.userAttributes.sub;
  const email = event.request.userAttributes.email;

  if (!sub) {
    throw new Error("post-confirmation: missing sub in userAttributes");
  }
  if (!email) {
    throw new Error("post-confirmation: missing email in userAttributes");
  }

  await createCompanyAndBindUser(sub, email);

  return event;
};
