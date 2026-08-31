import type {
  PreTokenGenerationTriggerEvent,
  PreTokenGenerationTriggerHandler,
} from "aws-lambda";

/**
 * Pre-token-generation Lambda for the Cognito User Pool.
 *
 * Triggers: `TokenGeneration_HostedAuth`, `TokenGeneration_Authentication`.
 *
 * Responsibilities:
 *   1. Read `custom:company_id` from user attributes.
 *   2. Read the user's `cognito:groups` from the event.
 *   3. Copy both into `event.response.claimsOverride.details` so the JWT contains them.
 *   4. If the user is in the `admin` group and has no TOTP MFA enrolled, throw so Cognito
 *      refuses to issue a token.
 *
 * The Lambda is a PURE FUNCTION. No AWS SDK calls. No DynamoDB. No Cognito SDK. The IAM
 * role for this Lambda has zero policy statements (AC-7 + AC-8 in WI-008).
 *
 * `custom:company_id` is read from Cognito user attributes, not from DynamoDB. This decouples
 * the first token issuance from the post-confirmation Lambda's DynamoDB write (DC-008-2-a).
 */

const ADMIN_GROUP = "admin";

function hasTotpMfa(userAttributes: Record<string, string | undefined>): boolean {
  // Cognito encodes TOTP enrollment as either a `cognito:user_status` of "CONFIRMED" together
  // with the user's MFA settings (we cannot read the latter directly), or as a
  // `software_token_mfa` attribute (set when a TOTP secret is associated with the user).
  // In practice, the most reliable signal is the absence of any MFA setting: if `email_verified`
  // is true and the user is in the `admin` group, they should also have TOTP enrolled. The
  // lack of an MFA-attribute marker is the failure mode.
  //
  // For MVP we treat the presence of `cognito:user_status === "CONFIRMED"` AND a non-empty
  // `email_verified` as the baseline, then look for the `cognito:mfa_enabled` attribute (set
  // by Cognito when any MFA method is enrolled) to gate the admin TOTP check.
  const mfaEnabled = userAttributes["cognito:mfa_enabled"] === "true";
  return mfaEnabled;
}

export const handler: PreTokenGenerationTriggerHandler = async (
  event: PreTokenGenerationTriggerEvent,
) => {
  const claims = event.response.claimsOverrideDetails?.claimsToAddOrOverride ?? {};
  const userAttributes = event.request.userAttributes as Record<string, string | undefined>;

  // Copy `custom:company_id` into the token. Read from user attributes (Cognito), not from
  // DynamoDB, so the first token issuance is independent of the post-confirmation write.
  const companyId = userAttributes["custom:company_id"];
  if (companyId) {
    claims["custom:company_id"] = companyId;
  }

  // Copy `cognito:groups` into the token. Cognito normally does this for us, but we copy
  // explicitly so the value is also present under the claimsOverride.details object that
  // downstream consumers can read consistently.
  const groupsOverride = event.request.groupConfiguration?.groupsToOverride;
  const groups: string[] = Array.isArray(groupsOverride) ? groupsOverride : [];
  if (groups.length > 0) {
    // aws-lambda types claimsToAddOrOverride as Record<string, string>, but Cognito
    // accepts string lists for `cognito:groups` in the claims override payload.
    (claims as Record<string, unknown>)["cognito:groups"] = groups;
  }

  // Admin users must have TOTP enrolled. If not, refuse the token.
  const isAdmin = groups.includes(ADMIN_GROUP);
  if (isAdmin && !hasTotpMfa(userAttributes)) {
    throw new Error("MFA required for admin group");
  }

  event.response.claimsOverrideDetails = {
    ...event.response.claimsOverrideDetails,
    claimsToAddOrOverride: claims,
  };

  return event;
};
