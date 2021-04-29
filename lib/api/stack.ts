import * as cdk from "@aws-cdk/core";
import * as appsync from "@aws-cdk/aws-appsync";
import * as cognito from "@aws-cdk/aws-cognito";
import * as path from "path";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as sfn from "@aws-cdk/aws-stepfunctions";

interface ApiStackProps extends cdk.StackProps {
  readonly recipientTable: dynamodb.Table;
  readonly userPool: cognito.UserPool;
  readonly poolTable: dynamodb.Table;
  readonly testResultProcessingStateMachine: sfn.StateMachine;
}

export class ApiStack extends cdk.Stack {
  public api: appsync.GraphqlApi;

  constructor(scope: cdk.Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // Creates the AppSync API
    this.api = new appsync.GraphqlApi(this, "graphql-api", {
      name: "kiko-api",
      schema: appsync.Schema.fromAsset(path.join(__dirname, "graphql", "schema.graphql")),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: props.userPool,
          },
        },
      },
      logConfig: {
        excludeVerboseContent: false,
        fieldLogLevel: appsync.FieldLogLevel.ALL,
      },
      xrayEnabled: true,
    });

    const stepFunctionEndpoint = `https://states.${this.region}.amazonaws.com`;
    const stepFunctionDataSource = this.api.addHttpDataSource("process_test_result", stepFunctionEndpoint, {
      authorizationConfig: {
        signingRegion: this.region,
        signingServiceName: "states",
      },
    });

    props.testResultProcessingStateMachine.grantStartExecution(stepFunctionDataSource);

    stepFunctionDataSource.createResolver({
      typeName: "Mutation",
      fieldName: "processTestResult",
      requestMappingTemplate: appsync.MappingTemplate.fromString(
        `
          $util.qr($ctx.stash.put("poolName", $context.arguments.input.poolName))
          $util.qr($ctx.stash.put("testResult", $context.arguments.input.testResult))
          $util.qr($ctx.stash.put("tenant", $context.identity.claims.get("cognito:groups").get(0)))
          {
            "version": "2018-05-29",
            "method": "POST",
            "resourcePath": "/",
            "params": {
              "headers": {
                "content-type": "application/x-amz-json-1.0",
                "x-amz-target":"AWSStepFunctions.StartExecution"
              },
              "body": {
                "stateMachineArn": "${props.testResultProcessingStateMachine.stateMachineArn}",
                "input": "$util.escapeJavaScript($util.toJson($ctx.stash))"
              }
            }
          }
        `
      ),
      responseMappingTemplate: appsync.MappingTemplate.fromString('{"status": "PENDING"}'),
    });

    const dynamoDbDataSource = this.api.addDynamoDbDataSource("pool_table", props.poolTable);
    const recipientTableDataSource = this.api.addDynamoDbDataSource("recipient_table", props.recipientTable);

    dynamoDbDataSource.createResolver({
      typeName: "Query",
      fieldName: "listPools",
      requestMappingTemplate: appsync.MappingTemplate.fromString(
        `
        {
          "version" : "2017-02-28",
          "operation" : "Query",
          "query" : {
            "expression": "tenant = :tenant",
              "expressionValues" : {
                ":tenant" : $util.dynamodb.toDynamoDBJson($context.identity.claims.get("cognito:groups").get(0))
              }
          }
        }
      `
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
    });

    recipientTableDataSource.createResolver({
      typeName: "Query",
      fieldName: "listRecipients",
      requestMappingTemplate: appsync.MappingTemplate.fromString(
        `
        {
          "version" : "2017-02-28",
          "operation" : "Query",
          "query" : {
            "expression": "tenant = :tenant",
              "expressionValues" : {
                ":tenant" : $util.dynamodb.toDynamoDBJson($context.identity.claims.get("cognito:groups").get(0))
              }
          }
        }
      `
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
    });

    recipientTableDataSource.createResolver({
      typeName: "Mutation",
      fieldName: "addRecipient",
      requestMappingTemplate: appsync.MappingTemplate.fromString(
        `
        {
          "version" : "2017-02-28",
          "operation" : "PutItem",
          "key" : {
            "tenant": $util.dynamodb.toDynamoDBJson($context.identity.claims.get("cognito:groups").get(0)),
            "address": $util.dynamodb.toDynamoDBJson($context.arguments.input.address)
          },
          "attributeValues": {
            "pools" : $util.dynamodb.toDynamoDBJson($context.arguments.input.pools),
          }
        }
      `
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });

    new cdk.CfnOutput(this, "aws-appsync-graphqlEndpoint", {
      value: this.api.graphqlUrl,
    });
  }
}
