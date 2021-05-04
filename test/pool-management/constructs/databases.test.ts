import "@aws-cdk/assert/jest";
import * as cdk from "@aws-cdk/core";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import { Databases } from "../../../lib/pool-management/constructs/databases";
import { ResourcePart } from "@aws-cdk/assert";
import { TenantManagement } from "../../../lib/tenant-management/constructs/tenant-management";

let stack: cdk.Stack;

beforeEach(() => {
  stack = new cdk.Stack();
});

test("All DynamoDb tables created", () => {
  const databases = new Databases(stack, "databases", {});

  expect(stack).toCountResources("AWS::DynamoDB::Table", 1);
  expect(databases.tables.length).toBe(1);
});

test("Pool table is created", () => {
  new Databases(stack, "databases", {});

  expect(stack).toHaveResource(
    "AWS::DynamoDB::Table",
    {
      Properties: {
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
        SSESpecification: {
          SSEEnabled: true,
        },
        BillingMode: "PAY_PER_REQUEST",
      },
      UpdateReplacePolicy: "Retain",
      DeletionPolicy: "Retain",
    },
    ResourcePart.CompleteDefinition
  );
});

test("Pool table is not replaced due to logical id change", () => {
  const databases = new Databases(stack, "databases", {});

  const poolTable = databases.tables.filter((value) => {
    return value.id === "test-pool";
  })[0];

  const poolTableLogicalId = stack.getLogicalId(poolTable.table.node.defaultChild as dynamodb.CfnTable);
  expect(poolTableLogicalId).toEqual("databasestestpool32F56BBB");
});
