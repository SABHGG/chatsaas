import { Duration } from "aws-cdk-lib";
import { ISecurityGroup, IVpc, Port, SubnetSelection } from "aws-cdk-lib/aws-ec2";
import {
  DatabaseProxy,
  ProxyTarget,
  ServerlessCluster,
} from "aws-cdk-lib/aws-rds";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

/**
 * Creates the RDS Proxy in front of the Aurora cluster with IAM auth and references the
 * cluster's credential secret.
 */
export function createRdsProxy(
  scope: Construct,
  props: {
    cluster: ServerlessCluster;
    secret: ISecret;
    vpc: IVpc;
    proxySecurityGroup: ISecurityGroup;
    clusterSecurityGroup: ISecurityGroup;
    subnetSelection: SubnetSelection;
  },
): DatabaseProxy {
  const proxy = new DatabaseProxy(scope, "AuroraProxy", {
    proxyTarget: ProxyTarget.fromCluster(props.cluster),
    secrets: [props.secret],
    vpc: props.vpc,
    vpcSubnets: props.subnetSelection,
    securityGroups: [props.proxySecurityGroup],
    iamAuth: true,
    requireTLS: true,
    maxConnectionsPercent: 100,
    maxIdleConnectionsPercent: 10,
  });

  return proxy;
}
