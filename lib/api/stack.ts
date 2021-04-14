import * as cdk from "@aws-cdk/core";
import * as appsync from "@aws-cdk/aws-appsync";
import * as cognito from "@aws-cdk/aws-cognito";
import * as path from "path";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as sfn from "@aws-cdk/aws-stepfunctions";

interface ApiStackProps extends cdk.StackProps {
  readonly userPool: cognito.UserPool;
  readonly poolTable: dynamodb.Table;
  readonly testResultProcessingStateMachine: sfn.StateMachine;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // Creates the AppSync API
    const api = new appsync.GraphqlApi(this, "graphql-api", {
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
    const stepFunctionDataSource = api.addHttpDataSource("process_test_result", stepFunctionEndpoint, {
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
          $util.qr($ctx.stash.put("groupName", $context.arguments.input.groupName))
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

    const dynamoDbDataSource = api.addDynamoDbDataSource("pool_table", props.poolTable);
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

    new cdk.CfnOutput(this, "aws-appsync-graphqlEndpoint", {
      value: api.graphqlUrl,
    });
  }
}
