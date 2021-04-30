import * as cdk from "@aws-cdk/core";
import * as lambdaNodejs from "@aws-cdk/aws-lambda-nodejs";
import * as lambda from "@aws-cdk/aws-lambda";
import * as logs from "@aws-cdk/aws-logs";
import * as iam from "@aws-cdk/aws-iam";
import * as path from "path";
import * as tasks from "@aws-cdk/aws-stepfunctions-tasks";
import * as sfn from "@aws-cdk/aws-stepfunctions";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as sns from "@aws-cdk/aws-sns";
import * as cw from "@aws-cdk/aws-cloudwatch";
import * as cwActions from "@aws-cdk/aws-cloudwatch-actions";

export interface TestResultWorkflowProps {
  readonly poolTable: dynamodb.Table;
  readonly activityLog: dynamodb.Table;
  readonly alarmTopic: sns.Topic;
}

export class TestResultWorkflow extends cdk.Construct {
  public stateMachine: sfn.StateMachine;

  constructor(scope: cdk.Construct, id: string, props: TestResultWorkflowProps) {
    super(scope, id);

    const forwardTestResultFunction = new lambdaNodejs.NodejsFunction(this, "forward-test-result-function", {
      entry: path.join(__dirname, "../lambdas", "forward-test-results.ts"),
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
        level: sfn.LogLevel.ERROR,
      },
    });

    this.stateMachine
      .metricFailed()
      .createAlarm(this, "execution-failed", {
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        alarmDescription: "Alarm for the number of executions that failed exceeded the threshold of 1. ",
      })
      .addAlarmAction(new cwActions.SnsAction(props.alarmTopic));

    this.stateMachine
      .metricThrottled()
      .createAlarm(this, "execution-throttled", {
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        alarmDescription: "Alarm for the number of executions that throttled exceeded the threshold of 1. ",
      })
      .addAlarmAction(new cwActions.SnsAction(props.alarmTopic));

    this.stateMachine
      .metricAborted()
      .createAlarm(this, "execution-aborted", {
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        alarmDescription: "Alarm for the number of executions that aborted exceeded the threshold of 1. ",
      })
      .addAlarmAction(new cwActions.SnsAction(props.alarmTopic));

    props.activityLog.grantWriteData(this.stateMachine);
    props.poolTable.grantReadData(this.stateMachine);
  }
}
