import { Stack } from "aws-cdk-lib";
import { IVpc, Vpc } from "aws-cdk-lib/aws-ec2";

/**
 * Returns the VPC for the data plane. Two paths:
 * 1. Mock: if `vpcId` is provided as a context value (flat key), the stack uses
 *    `Vpc.fromVpcAttributes` with explicit subnet IDs. This path lets `cdk synth` and the
 *    vitest suite run without AWS access.
 * 2. Default: `Vpc.fromLookup` reads the default VPC from AWS (requires the synth to be run
 *    with AWS credentials and a default VPC in the target account/region).
 *
 * The context values are flat (e.g. `-c vpcId=vpc-12345 -c privateSubnetIds=subnet-1,subnet-2
 * -c availabilityZones=us-east-1a,us-east-1b`). pnpm-workspace-safe; comma-separated lists.
 */
export function lookupVpc(scope: Stack): IVpc {
  const vpcId = scope.node.tryGetContext("vpcId") as string | undefined;
  const privateSubnetIdsRaw = scope.node.tryGetContext("privateSubnetIds") as string | undefined;
  const availabilityZonesRaw = scope.node.tryGetContext("availabilityZones") as string | undefined;

  if (vpcId && privateSubnetIdsRaw && availabilityZonesRaw) {
    const privateSubnetIds = privateSubnetIdsRaw.split(",").map((s) => s.trim());
    const availabilityZones = availabilityZonesRaw.split(",").map((s) => s.trim());
    return Vpc.fromVpcAttributes(scope, "ContextVpc", {
      vpcId,
      availabilityZones,
      privateSubnetIds,
    });
  }

  return Vpc.fromLookup(scope, "DefaultVpc", { isDefault: true });
}
