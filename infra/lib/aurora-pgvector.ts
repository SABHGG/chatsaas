import { Duration, RemovalPolicy } from "aws-cdk-lib";
import {
  AuroraPostgresEngineVersion,
  Credentials,
  DatabaseClusterEngine,
  ParameterGroup,
  ServerlessCluster,
} from "aws-cdk-lib/aws-rds";
import { ISecurityGroup, IVpc, SubnetSelection } from "aws-cdk-lib/aws-ec2";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

/**
 * Creates the Aurora Serverless v2 cluster with the `vector` extension enabled via a parameter
 * group. The actual `CREATE EXTENSION vector` runs from the custom resource after the cluster is
 * AVAILABLE; this construct only preloads the shared library.
 */
export function createAuroraPgVector(
  scope: Construct,
  props: {
    vpc: IVpc;
    subnetSelection: SubnetSelection;
    clusterSecurityGroup: ISecurityGroup;
    secret: ISecret;
    databaseName: string;
  },
) {
  const engine = DatabaseClusterEngine.auroraPostgres({
    version: AuroraPostgresEngineVersion.VER_16_4,
  });

  const parameterGroup = new ParameterGroup(scope, "PgVectorParamGroup", {
    engine,
    description: "Enables pgvector shared_preload_libraries for chatSaaS embeddings",
    parameters: {
      shared_preload_libraries: "vector",
    },
  });

  const cluster = new ServerlessCluster(scope, "AuroraPgVector", {
    engine,
    vpc: props.vpc,
    vpcSubnets: props.subnetSelection,
    securityGroups: [props.clusterSecurityGroup],
    parameterGroup,
    credentials: Credentials.fromSecret(props.secret, "chatsaas_admin"),
    databaseName: props.databaseName,
    scaling: {
      minCapacity: 0.5,
      maxCapacity: 4,
    },
    removalPolicy: RemovalPolicy.SNAPSHOT,
    deletionProtection: false,
    storageEncrypted: true,
    backupRetention: Duration.days(7),
  });

  return { cluster, parameterGroup };
}
