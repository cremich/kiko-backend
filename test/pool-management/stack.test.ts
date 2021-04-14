import { SynthUtils } from "@aws-cdk/assert";
import * as cdk from "@aws-cdk/core";
import { PoolManagementStack } from "../../lib/pool-management/stack";

test("Pool management stack matches snapshot", () => {
  const app = new cdk.App();
  const stack = new PoolManagementStack(app, "pool-management", { deployStage: "test" });
  expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
});
