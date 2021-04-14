import * as cdk from "@aws-cdk/core";
import * as lambdaNodejs from "@aws-cdk/aws-lambda-nodejs";
import * as lambdaEventSource from "@aws-cdk/aws-lambda-event-sources";
import * as lambda from "@aws-cdk/aws-lambda";
import * as logs from "@aws-cdk/aws-logs";
import * as iam from "@aws-cdk/aws-iam";
import * as path from "path";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as sfn from "@aws-cdk/aws-stepfunctions";

import { TestResultProcessingStateMachine } from "./constructs/test-result-processing";

interface PoolManagementStackProps extends cdk.StackProps {
  readonly deployStage: string;
}

export class PoolManagementStack extends cdk.Stack {
  public poolTable: dynamodb.Table;
  public testResultProcessingStateMachine: sfn.StateMachine;

  constructor(scope: cdk.Construct, id: string, props: PoolManagementStackProps) {
    super(scope, id, props);

    this.poolTable = new dynamodb.Table(this, "test-pool", {
      partitionKey: { name: "tenant", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "poolName", type: dynamodb.AttributeType.STRING },
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    if (props.deployStage !== "prod") {
      this.poolTable.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    }

    const activityLog = new dynamodb.Table(this, "activity-log", {
      partitionKey: { name: "tenant", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "dateTime", type: dynamodb.AttributeType.STRING },
    });

    if (props.deployStage !== "prod") {
      activityLog.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    }

    const testResultProcessingStateMachine = new TestResultProcessingStateMachine(this, "test-result-processing", {
      activityLog,
      poolTable: this.poolTable,
    });

    this.testResultProcessingStateMachine = testResultProcessingStateMachine.stateMachine;

    new cdk.CfnOutput(this, "test-result-processing-state-machine-arn", {
      value: this.testResultProcessingStateMachine.stateMachineArn,
    });
  }
}
