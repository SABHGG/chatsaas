import { describe, it, expect, beforeEach, vi } from "vitest";

// Set env vars BEFORE importing the handler (it reads them at module load).
process.env.COMPANIES_TABLE_NAME = "chatsaas-test-companies";
process.env.COGNITO_USER_POOL_ID = "us-east-1_abc";
process.env.AWS_REGION = "us-east-1";

import { mockClient } from "aws-sdk-client-mock";
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { PostConfirmationTriggerEvent } from "aws-lambda";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddbMock = mockClient(DynamoDBDocumentClient);
const cognitoMock = mockClient(CognitoIdentityProviderClient);

vi.mock("uuid", () => ({ v4: () => "fixed-company-uuid" }));

const handler = (await import("../lib/lambda/post-confirmation.js")).handler;

const baseEvent: PostConfirmationTriggerEvent = {
  version: "1",
  region: "us-east-1",
  userPoolId: "us-east-1_abc",
  userName: "user-123",
  callerContext: {
    awsSdkVersion: "1",
    clientId: "client-1",
  },
  triggerSource: "PostConfirmation_ConfirmSignUp",
  request: {
    userAttributes: {
      sub: "user-123",
      email: "alice@example.com",
    },
  },
  response: {},
};

describe("post-confirmation", () => {
  beforeEach(() => {
    ddbMock.reset();
    cognitoMock.reset();
    process.env.COMPANIES_TABLE_NAME = "chatsaas-test-companies";
    process.env.COGNITO_USER_POOL_ID = "us-east-1_abc";
  });

  it("writes a company row to DynamoDB and stamps custom:company_id via AdminUpdateUserAttributes", async () => {
    ddbMock.on(PutCommand).resolves({});
    cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});

    await handler(baseEvent, {} as any, () => {});

    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(1);
    const putCall = ddbMock.commandCalls(PutCommand)[0];
    const input = putCall.args[0].input;
    expect(input.TableName).toBe("chatsaas-test-companies");
    expect(input.Item).toMatchObject({
      id: "fixed-company-uuid",
      ownerUserId: "user-123",
      name: "alice",
    });
    expect(input.Item!.createdAt).toBeDefined();
    expect(input.Item!.updatedAt).toBeDefined();
    expect(input.ConditionExpression).toBe("attribute_not_exists(id)");

    expect(cognitoMock.commandCalls(AdminUpdateUserAttributesCommand)).toHaveLength(1);
    const updateCall = cognitoMock.commandCalls(AdminUpdateUserAttributesCommand)[0];
    const updateInput = updateCall.args[0].input;
    expect(updateInput.UserPoolId).toBe("us-east-1_abc");
    expect(updateInput.Username).toBe("user-123");
    expect(updateInput.UserAttributes).toEqual([
      { Name: "custom:company_id", Value: "fixed-company-uuid" },
    ]);
  });

  it("is idempotent: a duplicate trigger hits ConditionalCheckFailedException and skips AdminUpdate", async () => {
    const conditionalErr = Object.assign(new Error("exists"), {
      name: "ConditionalCheckFailedException",
    });
    ddbMock.on(PutCommand).rejects(conditionalErr);
    cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});

    await expect(handler(baseEvent, {} as any, () => {})).resolves.toBeDefined();
    expect(cognitoMock.commandCalls(AdminUpdateUserAttributesCommand)).toHaveLength(0);
  });

  it("propagates PutItem failure (the chain-of-custody AC-14 invariant)", async () => {
    ddbMock.on(PutCommand).rejects(new Error("DynamoDB down"));
    cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});

    await expect(handler(baseEvent, {} as any, () => {})).rejects.toThrow(
      "DynamoDB down",
    );
    expect(cognitoMock.commandCalls(AdminUpdateUserAttributesCommand)).toHaveLength(0);
  });

  it("rejects when sub is missing", async () => {
    const ev = {
      ...baseEvent,
      request: { userAttributes: { email: "alice@example.com" } },
    };
    await expect(handler(ev as any, {} as any, () => {})).rejects.toThrow(
      "missing sub",
    );
  });

  it("rejects when email is missing", async () => {
    const ev = {
      ...baseEvent,
      request: { userAttributes: { sub: "user-123" } },
    };
    await expect(handler(ev as any, {} as any, () => {})).rejects.toThrow(
      "missing email",
    );
  });
});
