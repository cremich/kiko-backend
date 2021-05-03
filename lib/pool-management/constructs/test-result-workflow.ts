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
import * as pinpoint from "@aws-cdk/aws-pinpoint";

export interface TestResultWorkflowProps {
  readonly poolTable: dynamodb.Table;
  readonly pinpointApplication: pinpoint.CfnApp;
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
          resources: [`${props.pinpointApplication.attrArn}/segments/*`],
        }),
      ],
    });

    forwardTestResultFunction.addEnvironment("POOL_TABLE_NAME", props.poolTable.tableName);
    forwardTestResultFunction.addEnvironment("PINPOINT_APPLICATION_ID", props.pinpointApplication.ref);
    props.poolTable.grantReadData(forwardTestResultFunction);

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

    const logGroup = new logs.LogGroup(this, "test-result-processing-log-group", {
      retention: logs.RetentionDays.ONE_DAY,
    });
    this.stateMachine = new sfn.StateMachine(this, "process-test-result", {
      definition: forwardTestResultTask,
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
  }
}
