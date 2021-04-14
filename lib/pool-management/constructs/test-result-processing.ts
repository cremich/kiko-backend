import * as cdk from "@aws-cdk/core";
import * as lambdaNodejs from "@aws-cdk/aws-lambda-nodejs";
import * as lambda from "@aws-cdk/aws-lambda";
import * as logs from "@aws-cdk/aws-logs";
import * as iam from "@aws-cdk/aws-iam";
import * as path from "path";
import * as tasks from "@aws-cdk/aws-stepfunctions-tasks";
import * as sfn from "@aws-cdk/aws-stepfunctions";
import * as dynamodb from "@aws-cdk/aws-dynamodb";

export interface TestResultProcessingStateMachineProps {
  poolTable: dynamodb.Table;
  activityLog: dynamodb.Table;
}

export class TestResultProcessingStateMachine extends cdk.Construct {
  public stateMachine: sfn.StateMachine;

  constructor(scope: cdk.Construct, id: string, props: TestResultProcessingStateMachineProps) {
    super(scope, id);

    const forwardTestResultFunction = new lambdaNodejs.NodejsFunction(this, "forward-test-result-function", {
      entry: path.join(__dirname, "lambdas", "forward-test-results.ts"),
      handler: "handler",
      bundling: { externalModules: [], sourceMap: true, minify: true },
      runtime: lambda.Runtime.NODEJS_14_X,
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_DAY,
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ["mobiletargeting:CreateCampaign"],
          resources: ["*"],
        }),
      ],
    });

    const logTestResultTask = new tasks.DynamoPutItem(this, "log-test-result", {
      table: props.activityLog,
      item: {
        tenant: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$.tenant")),
        dateTime: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$$.State.EnteredTime")),
        group: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$.poolName")),
        state: tasks.DynamoAttributeValue.fromString("TEST_RESULT"),
        testResult: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$.testResult")),
      },
      resultPath: "$.logTestResult",
    });

    const forwardTestResultTask = new tasks.LambdaInvoke(this, "forward-test-result", {
      lambdaFunction: forwardTestResultFunction,
      payload: sfn.TaskInput.fromObject({
        "tenant.$": "$.pool.Item.tenant.S",
        "pinpointApplicationId.$": "$.pool.Item.pinpointApplicationId.S",
        "segmentId.$": "$.pool.Item.segmentId.S",
        "poolName.$": "$.pool.Item.poolName.S",
        "testResult.$": "$.testResult",
      }),
      outputPath: "$.Payload",
    });

    const stateMachineDefinition = new tasks.DynamoGetItem(this, "get-pool", {
      table: props.poolTable,
      key: {
        tenant: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$.tenant")),
        poolName: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$.poolName")),
      },
      resultPath: "$.pool",
    }).next(
      new sfn.Choice(this, "check-pool-exists")
        .when(
          sfn.Condition.isNotPresent("$.pool.Item"),
          new sfn.Fail(this, "pool-not-found", {
            error: "pool-not-found",
          })
        )
        .when(
          sfn.Condition.isPresent("$.pool.Item"),
          new sfn.Choice(this, "check-test-result-is-positive")
            .when(sfn.Condition.stringEquals("$.testResult", "N"), logTestResultTask)
            .when(
              sfn.Condition.stringEquals("$.testResult", "P"),
              forwardTestResultTask.next(
                new tasks.DynamoPutItem(this, "log-test-result-forwarded", {
                  table: props.activityLog,
                  item: {
                    tenant: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$.tenant")),
                    dateTime: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$$.State.EnteredTime")),
                    pool: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$.poolName")),
                    state: tasks.DynamoAttributeValue.fromString("TEST_RESULT_FORWARDED"),
                    campaignId: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$.campaignId")),
                    campaignName: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$.campaignName")),
                    pinpointApplicationId: tasks.DynamoAttributeValue.fromString(
                      sfn.JsonPath.stringAt("$.pinpointApplicationId")
                    ),
                    targetSegment: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$.segmentId")),
                  },
                  resultPath: "$.logTestResult",
                }).next(logTestResultTask)
              )
            )
        )
    );

    const logGroup = new logs.LogGroup(this, "test-result-processing-log-group", {
      retention: logs.RetentionDays.ONE_DAY,
    });
    this.stateMachine = new sfn.StateMachine(this, "process-test-result", {
      definition: stateMachineDefinition,
      timeout: cdk.Duration.minutes(5),
      tracingEnabled: true,
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ALL,
      },
    });

    this.stateMachine.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:PutItem"],
        resources: [props.activityLog.tableArn],
      })
    );
    this.stateMachine.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:GetItem"],
        resources: [props.poolTable.tableArn],
      })
    );
  }
}
