/**
 * Companies table name pattern.
 *
 * The table itself is created inside `CognitoUserPoolConstruct` so its lifecycle is bound to
 * the identity stack. This file is the single source of truth for the table name pattern and
 * the ARNs that the IAM policy builders use.
 */

export const COMPANIES_TABLE_NAME_PATTERN = (envName: string): string =>
  `chatsaas-${envName}-companies`;

export const companiesTableArn = (
  region: string,
  account: string,
  envName: string,
): string => `arn:aws:dynamodb:${region}:${account}:table/${COMPANIES_TABLE_NAME_PATTERN(envName)}`;
