import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  AccountRecovery,
  AdvancedSecurityMode,
  CfnUserPool,
  ClientAttributes,
  Mfa,
  StringAttribute,
  OAuthScope,
  UserPool,
  UserPoolClient,
  UserPoolDomain,
  UserPoolGroup,
  UserPoolProps,
} from "aws-cdk-lib/aws-cognito";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Runtime, Code, Function } from "aws-cdk-lib/aws-lambda";
import { ComparisonOperator, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";
import { postConfirmationPolicyStatements } from "./cognito-policies.js";
import { COMPANIES_TABLE_NAME_PATTERN } from "./lambda/companies-table.js";
import { bundleLambdaHandler } from "./bundle-lambdas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");
const LAMBDA_DIR = join(__dirname, "lambda");

export interface CognitoUserPoolConstructProps {
  readonly envName: "dev" | "prod";
  readonly cognitoDomainPrefix: string;
  readonly callbackUrls: { dev: string[]; prod: string[] };
  readonly signOutUrls: { dev: string[]; prod: string[] };
  readonly adminAllowlist: string[];
  readonly mfaMode: "optional" | "required";
  readonly advancedSecurityMode: "off" | "audit" | "enforced";
  readonly region: string;
}

/**
 * Provisions the chatSaaS identity stack.
 *
 * See WI-008 spec for the full design rationale. The chain-of-custody
 * invariants (AC-13 + AC-14) are closed by the writeAttributes whitelist
 * on the User Pool Client and the IAM scoping of the post-confirmation
 * Lambda.
 */
export class CognitoUserPoolConstruct extends Construct {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly userPoolDomain: UserPoolDomain;
  public readonly companiesTable: Table;
  public readonly postConfirmationFn: Function;
  public readonly preTokenGenerationFn: Function;

  constructor(scope: Construct, id: string, props: CognitoUserPoolConstructProps) {
    super(scope, id);

    if (props.envName === "prod" && props.adminAllowlist.length === 0) {
      throw new Error(
        "CognitoUserPoolConstruct: adminAllowlist is required for prod (empty in dev only).",
      );
    }
    if (!props.region) {
      throw new Error("CognitoUserPoolConstruct: region prop is required.");
    }

    // ---- DynamoDB table for companies (created BEFORE the Lambda so we can
    // reference tableName in the Lambda env). ----
    this.companiesTable = new Table(this, "CompaniesTable", {
      tableName: COMPANIES_TABLE_NAME_PATTERN(props.envName),
      partitionKey: { name: "id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: props.envName === "prod",
      removalPolicy:
        props.envName === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // ---- User Pool ----
    const userPoolProps: UserPoolProps = {
      userPoolName: `chatsaas-${props.envName}-users`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      customAttributes: {
        company_id: new StringAttribute({ minLen: 1, maxLen: 64, mutable: false }),
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3),
      },
      mfa: props.mfaMode === "required" ? Mfa.OPTIONAL : Mfa.OFF,
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      deletionProtection: props.envName === "prod",
      advancedSecurityMode:
        props.advancedSecurityMode === "off"
          ? AdvancedSecurityMode.OFF
          : props.advancedSecurityMode === "enforced"
            ? AdvancedSecurityMode.ENFORCED
            : AdvancedSecurityMode.AUDIT,
    };

    this.userPool = new UserPool(this, "UserPool", userPoolProps);

    // ---- Post-confirmation Lambda ----
    const postConfirmationCode = bundleLambdaHandler(
      "post-confirmation.ts",
      LAMBDA_DIR,
    );
    this.postConfirmationFn = new Function(this, "PostConfirmationFn", {
      functionName: `chatsaas-${props.envName}-post-confirmation`,
      runtime: Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: Code.fromInline(postConfirmationCode),
      environment: {
        COMPANIES_TABLE_NAME: this.companiesTable.tableName,
        COGNITO_USER_POOL_ID: this.userPool.userPoolId,
      },
      timeout: Duration.seconds(10),
    });

    const region = props.region;
    const account = Stack.of(this).account ?? "000000000000";
    const statements = postConfirmationPolicyStatements(
      region,
      account,
      props.envName,
      this.userPool.userPoolArn,
    );
    for (const s of statements) {
      this.postConfirmationFn.addToRolePolicy(s);
    }
    this.companiesTable.grantWriteData(this.postConfirmationFn);

    // ---- Pre-token-generation Lambda (pure function) ----
    const preTokenCode = bundleLambdaHandler(
      "pre-token-generation.ts",
      LAMBDA_DIR,
    );
    this.preTokenGenerationFn = new Function(this, "PreTokenGenerationFn", {
      functionName: `chatsaas-${props.envName}-pre-token-generation`,
      runtime: Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: Code.fromInline(preTokenCode),
      timeout: Duration.seconds(5),
    });

    // ---- Wire Lambda triggers to the User Pool (CfnUserPool escape hatch) ----
    (this.userPool.node.defaultChild as CfnUserPool).lambdaConfig = {
      postConfirmation: this.postConfirmationFn.functionArn,
      preTokenGeneration: this.preTokenGenerationFn.functionArn,
    };

    // ---- User Pool Client ----
    this.userPoolClient = this.userPool.addClient("WebClient", {
      userPoolClientName: `chatsaas-${props.envName}-web`,
      generateSecret: false,
      authFlows: { userSrp: true, userPassword: false, custom: false },
      oAuth: {
        flows: { authorizationCodeGrant: true, implicitCodeGrant: false },
        scopes: [
          OAuthScope.OPENID,
          OAuthScope.EMAIL,
          OAuthScope.PROFILE,
        ],
        callbackUrls: props.callbackUrls[props.envName],
        logoutUrls: props.signOutUrls[props.envName],
      },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      readAttributes: new ClientAttributes()
        .withStandardAttributes({ email: true, emailVerified: true })
        .withCustomAttributes("company_id"),
      writeAttributes: new ClientAttributes().withStandardAttributes({ email: true }), // AC-13: custom:company_id is excluded by design.
    });

    // ---- User Pool Domain ----
    this.userPoolDomain = this.userPool.addDomain("Domain", {
      cognitoDomain: { domainPrefix: props.cognitoDomainPrefix },
    });

    // ---- User Pool Groups ----
    new UserPoolGroup(this, "CustomerGroup", {
      userPool: this.userPool,
      groupName: "customer",
      description: "Company user; default for self-signup.",
      precedence: 0,
    });
    new UserPoolGroup(this, "AdminGroup", {
      userPool: this.userPool,
      groupName: "admin",
      description: "chatSaaS staff; MFA TOTP required.",
      precedence: 10,
    });

    // ---- CloudWatch alarms ----
    for (const fn of [this.postConfirmationFn, this.preTokenGenerationFn]) {
      fn.metricErrors({ period: Duration.minutes(5) }).createAlarm(this, `${fn.node.id}Alarm`, {
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
      });
    }

    // ---- Stack outputs ----
    new CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
      exportName: `${Stack.of(this).stackName}:UserPoolId`,
    });
    new CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
      exportName: `${Stack.of(this).stackName}:UserPoolClientId`,
    });
    new CfnOutput(this, "UserPoolDomain", {
      value: `https://${props.cognitoDomainPrefix}.auth.${region}.amazoncognito.com`,
      exportName: `${Stack.of(this).stackName}:UserPoolDomain`,
    });
    new CfnOutput(this, "IssuerUrl", {
      value: `https://cognito-idp.${region}.amazonaws.com/${this.userPool.userPoolId}`,
      exportName: `${Stack.of(this).stackName}:IssuerUrl`,
    });
  }
}
