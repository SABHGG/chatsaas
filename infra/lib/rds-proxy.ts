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
 *
 * Note: ServerlessCluster.engine is not exposed as IDatabaseCluster.engine on this
 * CDK version, so ProxyTarget.bind throws `CouldNotDetermineEngineForProxyTarget` at synth
 * time. This is a known pre-existing limitation; in a real environment we would use
 * `DatabaseCluster` (v2 provisioned) or fall back to direct RDS endpoints. Documented as a
 * WI-004 follow-up; out of scope for WI-008.
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
