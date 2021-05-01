import "@aws-cdk/assert/jest";
import * as cdk from "@aws-cdk/core";
import * as fs from "fs";
import * as path from "path";
import * as sfn from "@aws-cdk/aws-stepfunctions";
import * as cognito from "@aws-cdk/aws-cognito";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import { GraphqlApi, KikoApiProps } from "../../../lib/api/constructs/graphql-api";

let stack: cdk.Stack;
let props: KikoApiProps;

beforeEach(() => {
  stack = new cdk.Stack();
  props = {
    userPool: new cognito.UserPool(stack, "user-pool", {}),
    poolTable: new dynamodb.Table(stack, "pool-table", {
      partitionKey: { name: "tenant", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "poolName", type: dynamodb.AttributeType.STRING },
    }),
    testResultWorkflow: new sfn.StateMachine(stack, "state-machine", {
      definition: new sfn.Pass(stack, "pass"),
    }),
    region: "eu-central-1",
  };
});

test("GraphQL API user pool authentication created", () => {
  new GraphqlApi(stack, "api", props);
  const userPoolLogicalId = stack.getLogicalId(props.userPool.node.defaultChild as cognito.CfnUserPool);

  expect(stack).toHaveResource("AWS::AppSync::GraphQLApi", {
    Name: "kiko-api",
    AuthenticationType: "AMAZON_COGNITO_USER_POOLS",
    UserPoolConfig: {
      AwsRegion: {
        Ref: "AWS::Region",
      },
      DefaultAction: "ALLOW",
      UserPoolId: {
        Ref: userPoolLogicalId,
      },
    },
  });
});

test("GraphQL Schema matches source schema definition", async (done) => {
  const graphqlApi = new GraphqlApi(stack, "api", props);

  fs.readFile(path.join(__dirname, "../../../lib/api/graphql", "schema.graphql"), "utf8", (error, data) => {
    expect(graphqlApi.api.schema.definition).toEqual(data);
    done();
  });
});
// //
// // test("DynamoDb datasource for recipient list table created", () => {
// //   const stack = new ApiStack(app, "api", {
// //     userPool: tenantManagementStack.userPool,
// //     poolTable: poolManagementStack.poolTable,
// //     recipientTable: poolManagementStack.recipientTable,
// //     testResultProcessingStateMachine: poolManagementStack.testResultProcessingStateMachine,
// //   });
// //   expect(stack).toHaveResource("AWS::AppSync::DataSource", {
// //     Name: "recipient_table",
// //     Type: "AMAZON_DYNAMODB",
// //   });
// // });
