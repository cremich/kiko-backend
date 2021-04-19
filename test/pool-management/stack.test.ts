import "@aws-cdk/assert/jest";
import * as cdk from "@aws-cdk/core";
import { PoolManagementStack } from "../../lib/pool-management/stack";

test("Pool table is created with tenant partition key and poolName sort key", () => {
  const app = new cdk.App();
  const stack = new PoolManagementStack(app, "pool-management", { deployStage: "test" });
  expect(stack).toHaveResource("AWS::DynamoDB::Table", {
    KeySchema: [
      {
        AttributeName: "tenant",
        KeyType: "HASH",
      },
      {
        AttributeName: "poolName",
        KeyType: "RANGE",
      },
    ],
    AttributeDefinitions: [
      {
        AttributeName: "tenant",
        AttributeType: "S",
      },
      {
        AttributeName: "poolName",
        AttributeType: "S",
      },
    ],
  });
});

test("Activity log table is created with tenant partition key and dateTime sort key", () => {
  const app = new cdk.App();
  const stack = new PoolManagementStack(app, "pool-management", { deployStage: "test" });
  expect(stack).toHaveResource("AWS::DynamoDB::Table", {
    KeySchema: [
      {
        AttributeName: "tenant",
        KeyType: "HASH",
      },
      {
        AttributeName: "dateTime",
        KeyType: "RANGE",
      },
    ],
    AttributeDefinitions: [
      {
        AttributeName: "tenant",
        AttributeType: "S",
      },
      {
        AttributeName: "dateTime",
        AttributeType: "S",
      },
    ],
  });
});

test("Pool table is created name {deployStage}-kiko-test-pool", () => {
  const app = new cdk.App();
  const stack = new PoolManagementStack(app, "pool-management", { deployStage: "test" });
  expect(stack).toHaveResource("AWS::DynamoDB::Table", {
    TableName: "test-kiko-test-pool",
  });
});

test("Activity log table is created name {deployStage}-kiko-activity-log", () => {
  const app = new cdk.App();
  const stack = new PoolManagementStack(app, "pool-management", { deployStage: "test" });
  expect(stack).toHaveResource("AWS::DynamoDB::Table", {
    TableName: "test-kiko-activity-log",
  });
});
