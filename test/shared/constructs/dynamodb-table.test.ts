import * as cdk from "@aws-cdk/core";
import "@aws-cdk/assert/jest";
import { ResourcePart } from "@aws-cdk/assert";
import { DynamodbTable } from "../../../lib/shared/constructs/dynamodb-table";
import * as dynamodb from "@aws-cdk/aws-dynamodb";

test("DynamoDb will not be destroyed on prod", () => {
  const stack = new cdk.Stack();

  new DynamodbTable(stack, "table", {
    partitionKey: { name: "tenant", type: dynamodb.AttributeType.STRING },
    sortKey: { name: "poolName", type: dynamodb.AttributeType.STRING },
    stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    deployStage: "prod",
  });
  expect(stack).toHaveResource(
    "AWS::DynamoDB::Table",
    {
      UpdateReplacePolicy: "Retain",
      DeletionPolicy: "Retain",
    },
    ResourcePart.CompleteDefinition
  );
});

test("DynamoDb will be destroyed on dev environments", () => {
  const stack = new cdk.Stack();

  new DynamodbTable(stack, "table", {
    partitionKey: { name: "tenant", type: dynamodb.AttributeType.STRING },
    sortKey: { name: "poolName", type: dynamodb.AttributeType.STRING },
    stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    deployStage: "dev",
  });
  expect(stack).toHaveResource(
    "AWS::DynamoDB::Table",
    {
      UpdateReplacePolicy: "Delete",
      DeletionPolicy: "Delete",
    },
    ResourcePart.CompleteDefinition
  );
});
