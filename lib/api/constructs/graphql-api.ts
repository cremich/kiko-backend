import * as cdk from "@aws-cdk/core";
import * as appsync from "@aws-cdk/aws-appsync";
import * as cognito from "@aws-cdk/aws-cognito";
import * as path from "path";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as sfn from "@aws-cdk/aws-stepfunctions";

export interface KikoApiProps {
  readonly userPool: cognito.UserPool;
  readonly poolTable: dynamodb.Table;
  readonly testResultWorkflow: sfn.StateMachine;
  readonly region: string;
}

export class GraphqlApi extends cdk.Construct {
  public api: appsync.GraphqlApi;

  constructor(scope: cdk.Construct, id: string, props: KikoApiProps) {
    super(scope, id);

    this.api = new appsync.GraphqlApi(this, "graphql-api", {
      name: "kiko-api",
      schema: appsync.Schema.fromAsset(path.join(__dirname, "../graphql", "schema.graphql")),
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
        fieldLogLevel: appsync.FieldLogLevel.ERROR,
      },
      xrayEnabled: true,
    });

    const stepFunctionEndpoint = `https://states.${props.region}.amazonaws.com`;
    const stepFunctionDataSource = this.api.addHttpDataSource("process_test_result", stepFunctionEndpoint, {
      authorizationConfig: {
        signingRegion: props.region,
        signingServiceName: "states",
      },
    });

    props.testResultWorkflow.grantStartExecution(stepFunctionDataSource);

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
                "stateMachineArn": "${props.testResultWorkflow.stateMachineArn}",
                "input": "$util.escapeJavaScript($util.toJson($ctx.stash))"
              }
            }
          }
        `
      ),
      responseMappingTemplate: appsync.MappingTemplate.fromString('{"status": "PENDING"}'),
    });

    const dynamoDbDataSource = this.api.addDynamoDbDataSource("pool_table", props.poolTable);
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
  }
}
