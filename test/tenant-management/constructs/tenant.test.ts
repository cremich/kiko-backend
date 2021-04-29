import * as cdk from "@aws-cdk/core";
import "@aws-cdk/assert/jest";
import { Tenant } from "../../../lib/tenant-management/constructs/tenant";
import * as pinpoint from "@aws-cdk/aws-pinpoint";
import * as cognito from "@aws-cdk/aws-cognito";
import * as dynamodb from "@aws-cdk/aws-dynamodb";

let stack: cdk.Stack;
let pinpointApplication: pinpoint.CfnApp;
let userPool: cognito.UserPool;
let poolTable: dynamodb.Table;

beforeEach(() => {
  stack = new cdk.Stack();

  userPool = new cognito.UserPool(stack, "user-pool", {});
  pinpointApplication = new pinpoint.CfnApp(stack, "pinpoint-application", { name: "kiko" });
  poolTable = new dynamodb.Table(stack, "pool-table", {
    partitionKey: { name: "tenant", type: dynamodb.AttributeType.STRING },
    sortKey: { name: "poolName", type: dynamodb.AttributeType.STRING },
  });
});

test("Cognito group for tenant is created in user pool", () => {
  new Tenant(stack, "test-tenant", {
    tenantName: "test-tenant",
    tenantDescription: "A tenant for unit tests",
    pinpointApplication,
    userPool,
    poolTable,
    testPools: [],
  });

  expect(stack).toHaveResource("AWS::Cognito::UserPoolGroup", {
    GroupName: "test-tenant",
    UserPoolId: {
      Ref: stack.getLogicalId(userPool.node.defaultChild as cognito.CfnUserPool),
    },
  });
});
