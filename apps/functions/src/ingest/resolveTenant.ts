import {
  DynamoDBDocumentClient,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import type { CognitoAccessTokenClaims } from "../auth/claims.js";
import type {
  DocumentRecord,
  ResolvedTenant,
} from "./types.js";
import { TenantResolutionError } from "./types.js";
export { TenantResolutionError } from "./types.js";

/**
 * Resolves the JWT-claimed tenant against the path / Document row.
 *
 * SECURITY INVARIANT — `companyId` and `chatbotId` come from the verified
 * Cognito JWT and the `:chatbotId` path parameter, never from the request
 * body or query string. Body field overrides are ignored. The unit test
 * `resolveTenant.test.ts > ignores body-field overrides` asserts this and
 * is a release blocker.
 */
export interface ResolveTenantInput {
  jwtClaims: CognitoAccessTokenClaims;
  pathParams: { chatbotId: string; documentId?: string };
  /**
   * The Document row for the request. `null` on the upload path (the row
   * does not exist yet). The IngestLambda always passes the row it just
   * looked up.
   */
  documentRow: DocumentRecord | null;
  documentsTable: string;
  ddb: DynamoDBDocumentClient;
}

export async function resolveTenant(
  input: ResolveTenantInput,
): Promise<ResolvedTenant> {
  const sub = input.jwtClaims.sub;
  if (!sub) {
    throw new TenantResolutionError("missing_sub", "JWT missing sub");
  }
  const jwtCompanyId = input.jwtClaims["custom:company_id"];
  if (!jwtCompanyId || typeof jwtCompanyId !== "string") {
    throw new TenantResolutionError(
      "missing_company_id",
      "JWT missing custom:company_id",
    );
  }
  const pathChatbotId = input.pathParams.chatbotId;
  if (!pathChatbotId) {
    throw new TenantResolutionError("missing_chatbot_id", "path param :chatbotId is required");
  }
  if (input.documentRow === null) {
    // Upload path: there is no Document row yet. We trust the JWT for
    // `companyId` and the path for `chatbotId` and let the route handler
    // perform the S3 PUT + Document PUT. The IngestLambda re-resolves
    // ownership from the row before any Bedrock / Aurora call.
    return {
      sub,
      companyId: jwtCompanyId,
      chatbotId: pathChatbotId,
    };
  }
  // Read path: assert the row's `chatbotId` matches the path param and
  // its `companyId` matches the JWT claim.
  if (input.documentRow.chatbotId !== pathChatbotId) {
    throw new TenantResolutionError(
      "chatbot_mismatch",
      "documentRow.chatbotId does not match :chatbotId",
    );
  }
  if (input.documentRow.companyId !== jwtCompanyId) {
    throw new TenantResolutionError(
      "company_mismatch",
      "documentRow.companyId does not match JWT custom:company_id",
    );
  }
  return {
    sub,
    companyId: jwtCompanyId,
    chatbotId: pathChatbotId,
    documentId: input.documentRow.id,
  };
}

/**
 * Loads the Document row from DynamoDB. Returns `null` if the row does not
 * exist. Throws on real DynamoDB errors.
 */
export async function loadDocument(
  ddb: DynamoDBDocumentClient,
  documentsTable: string,
  documentId: string,
): Promise<DocumentRecord | null> {
  const out = await ddb.send(
    new GetCommand({
      TableName: documentsTable,
      Key: { id: documentId },
    }),
  );
  return (out.Item as DocumentRecord | undefined) ?? null;
}

/**
 * Checks that the given chatbotId belongs to the JWT-claimed company.
 * Returns the chatbot row if found and owned, throws TenantResolutionError otherwise.
 * Used by documentsList and documentsUpload to enforce cross-tenant 403.
 */
export interface CheckChatbotOwnershipInput {
  jwtClaims: CognitoAccessTokenClaims;
  chatbotId: string;
  chatbotsTable: string;
  ddb: DynamoDBDocumentClient;
}

export async function checkChatbotOwnership(
  input: CheckChatbotOwnershipInput,
): Promise<{ id: string; companyId: string }> {
  const sub = input.jwtClaims.sub;
  if (!sub) {
    throw new TenantResolutionError("missing_sub", "JWT missing sub");
  }
  const jwtCompanyId = input.jwtClaims["custom:company_id"];
  if (!jwtCompanyId || typeof jwtCompanyId !== "string") {
    throw new TenantResolutionError(
      "missing_company_id",
      "JWT missing custom:company_id",
    );
  }
  const out = await input.ddb.send(
    new GetCommand({
      TableName: input.chatbotsTable,
      Key: { id: input.chatbotId },
    }),
  );
  const chatbot = out.Item as { id: string; companyId: string } | undefined;
  if (!chatbot) {
    throw new TenantResolutionError("chatbot_not_found", "chatbot does not exist");
  }
  if (chatbot.companyId !== jwtCompanyId) {
    throw new TenantResolutionError(
      "company_mismatch",
      "chatbot does not belong to the JWT-claimed company",
    );
  }
  return { id: chatbot.id, companyId: chatbot.companyId };
}


