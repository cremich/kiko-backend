import "@aws-cdk/assert/jest";
import * as cdk from "@aws-cdk/core";
import * as fs from "fs";
import { ApiStack } from "../../lib/api/stack";
import { PoolManagementStack } from "../../lib/pool-management/stack";
import { TenantManagementStack } from "../../lib/tenant-management/stack";
import * as path from "path";

let poolManagementStack: PoolManagementStack;
let tenantManagementStack: TenantManagementStack;
let app: cdk.App;

beforeEach(() => {
  app = new cdk.App({
    context: {
      tenants: [],
    },
  });

  poolManagementStack = new PoolManagementStack(app, "pool-management", { deployStage: "test" });
  tenantManagementStack = new TenantManagementStack(app, "tenant-management", {
    poolTable: poolManagementStack.poolTable,
    deployStage: "test",
  });
});

test("GraphQL APi with name kiko-api is created", () => {
  const stack = new ApiStack(app, "api", {
    userPool: tenantManagementStack.userPool,
    poolTable: poolManagementStack.poolTable,
    recipientTable: poolManagementStack.recipientTable,
    testResultProcessingStateMachine: poolManagementStack.testResultProcessingStateMachine,
  });
  expect(stack).toHaveResource("AWS::AppSync::GraphQLApi", {
    Name: "kiko-api",
  });
});

test("GraphQL Schema matches source schema definition", async (done) => {
  const stack = new ApiStack(app, "api", {
    userPool: tenantManagementStack.userPool,
    poolTable: poolManagementStack.poolTable,
    recipientTable: poolManagementStack.recipientTable,
    testResultProcessingStateMachine: poolManagementStack.testResultProcessingStateMachine,
  });

  fs.readFile(path.join(__dirname, "../../lib/api/graphql", "schema.graphql"), "utf8", (error, data) => {
    expect(stack.api.schema.definition).toEqual(data);
    done();
  });
});

test("DynamoDb datasource for recipient list table created", () => {
  const stack = new ApiStack(app, "api", {
    userPool: tenantManagementStack.userPool,
    poolTable: poolManagementStack.poolTable,
    recipientTable: poolManagementStack.recipientTable,
    testResultProcessingStateMachine: poolManagementStack.testResultProcessingStateMachine,
  });
  expect(stack).toHaveResource("AWS::AppSync::DataSource", {
    Name: "recipient_table",
    Type: "AMAZON_DYNAMODB",
  });
});
