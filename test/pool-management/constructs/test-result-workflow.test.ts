import "@aws-cdk/assert/jest";
import * as cdk from "@aws-cdk/core";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as pinpoint from "@aws-cdk/aws-pinpoint";
import * as sfn from "@aws-cdk/aws-stepfunctions";
import * as sns from "@aws-cdk/aws-sns";
import {
  TestResultWorkflow,
  TestResultWorkflowProps,
} from "../../../lib/pool-management/constructs/test-result-workflow";

let stack: cdk.Stack;
let props: TestResultWorkflowProps;

beforeEach(() => {
  stack = new cdk.Stack();
  props = {
    poolTable: new dynamodb.Table(stack, "pool-table", {
      partitionKey: { name: "tenant", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "poolName", type: dynamodb.AttributeType.STRING },
    }),
    pinpointApplication: new pinpoint.CfnApp(stack, "pinpoint-app", { name: "test-pinpoint-app" }),
    alarmTopic: new sns.Topic(stack, "alarm-topic", {}),
  };
});

test("Test result workflow state machine created", () => {
  new TestResultWorkflow(stack, "test-result-workflow", props);

  expect(stack).toHaveResource("AWS::StepFunctions::StateMachine", {
    TracingConfiguration: {
      Enabled: true,
    },
  });
});

test("Test result workflow log retention set to 1 day", () => {
  new TestResultWorkflow(stack, "test-result-workflow", props);

  expect(stack).toHaveResource("AWS::Logs::LogGroup", {
    RetentionInDays: 1,
  });
});

test("Test result workflow alarm for failed executions is created", () => {
  const testResultWorkflow = new TestResultWorkflow(stack, "test-result-workflow", props);
  const topicLogicalId = stack.getLogicalId(props.alarmTopic.node.defaultChild as sns.CfnTopic);
  const stateMachineLogicalId = stack.getLogicalId(
    testResultWorkflow.stateMachine.node.defaultChild as sfn.CfnStateMachine
  );

  expect(stack).toHaveResource("AWS::CloudWatch::Alarm", {
    ComparisonOperator: "GreaterThanOrEqualToThreshold",
    EvaluationPeriods: 1,
    Threshold: 1,
    MetricName: "ExecutionsFailed",
    Namespace: "AWS/States",
    AlarmActions: [
      {
        Ref: topicLogicalId,
      },
    ],
    Dimensions: [
      {
        Name: "StateMachineArn",
        Value: {
          Ref: stateMachineLogicalId,
        },
      },
    ],
  });
});

test("Test result workflow alarm for throttled executions is created", () => {
  const testResultWorkflow = new TestResultWorkflow(stack, "test-result-workflow", props);
  const topicLogicalId = stack.getLogicalId(props.alarmTopic.node.defaultChild as sns.CfnTopic);
  const stateMachineLogicalId = stack.getLogicalId(
    testResultWorkflow.stateMachine.node.defaultChild as sfn.CfnStateMachine
  );

  expect(stack).toHaveResource("AWS::CloudWatch::Alarm", {
    ComparisonOperator: "GreaterThanOrEqualToThreshold",
    EvaluationPeriods: 1,
    Threshold: 1,
    MetricName: "ExecutionThrottled",
    Namespace: "AWS/States",
    AlarmActions: [
      {
        Ref: topicLogicalId,
      },
    ],
    Dimensions: [
      {
        Name: "StateMachineArn",
        Value: {
          Ref: stateMachineLogicalId,
        },
      },
    ],
  });
});

test("Test result workflow alarm for aborted executions is created", () => {
  const testResultWorkflow = new TestResultWorkflow(stack, "test-result-workflow", props);
  const topicLogicalId = stack.getLogicalId(props.alarmTopic.node.defaultChild as sns.CfnTopic);
  const stateMachineLogicalId = stack.getLogicalId(
    testResultWorkflow.stateMachine.node.defaultChild as sfn.CfnStateMachine
  );

  expect(stack).toHaveResource("AWS::CloudWatch::Alarm", {
    ComparisonOperator: "GreaterThanOrEqualToThreshold",
    EvaluationPeriods: 1,
    Threshold: 1,
    MetricName: "ExecutionsAborted",
    Namespace: "AWS/States",
    AlarmActions: [
      {
        Ref: topicLogicalId,
      },
    ],
    Dimensions: [
      {
        Name: "StateMachineArn",
        Value: {
          Ref: stateMachineLogicalId,
        },
      },
    ],
  });
});
