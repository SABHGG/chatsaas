import { Port, SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

/**
 * Creates the three security groups used by the data plane:
 * - LambdaSG: outbound 5432 to ProxySG
 * - ProxySG: outbound 5432 to ClusterSG
 * - ClusterSG: inbound 5432 from ProxySG only
 *
 * The Lambda wiring itself is a follow-up WI; this constructs the SGs so the cluster and proxy
 * can already reference them.
 */
export function createSecurityGroups(scope: Construct, _vpc: Vpc) {
  const lambdaSg = new SecurityGroup(scope, "LambdaSG", {
    description: "Security group for chatSaaS Lambda functions (outbound to RDS Proxy)",
    allowAllOutbound: false,
  });
  const proxySg = new SecurityGroup(scope, "ProxySG", {
    description: "Security group for the RDS Proxy (outbound to cluster)",
    allowAllOutbound: false,
  });
  const clusterSg = new SecurityGroup(scope, "ClusterSG", {
    description: "Security group for the Aurora cluster (inbound 5432 from ProxySG only)",
    allowAllOutbound: false,
  });

  // Lambda can talk to the proxy on 5432.
  lambdaSg.addEgressRule(proxySg, Port.tcp(5432), "Lambda to proxy");
  // Proxy can talk to the cluster on 5432.
  proxySg.addEgressRule(clusterSg, Port.tcp(5432), "Proxy to cluster");
  // Cluster accepts 5432 from the proxy.
  clusterSg.addIngressRule(proxySg, Port.tcp(5432), "Proxy to cluster");

  return { lambdaSg, proxySg, clusterSg };
}
