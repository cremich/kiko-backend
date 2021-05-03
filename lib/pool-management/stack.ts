import * as cdk from "@aws-cdk/core";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as sfn from "@aws-cdk/aws-stepfunctions";

import { TestResultProcessingStateMachine } from "./constructs/test-result-processing";
import { DynamodbTable } from "../shared/constructs/dynamodb-table";

interface PoolManagementStackProps extends cdk.StackProps {
  readonly deployStage: string;
}

export class PoolManagementStack extends cdk.Stack {
  public poolTable: dynamodb.Table;
  public recipientTable: dynamodb.Table;
  public testResultProcessingStateMachine: sfn.StateMachine;

  constructor(scope: cdk.Construct, id: string, props: PoolManagementStackProps) {
    super(scope, id, props);

    this.poolTable = new DynamodbTable(this, "test-pool", {
      tableName: `${props.deployStage}-kiko-test-pool`,
      partitionKey: { name: "tenant", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "poolName", type: dynamodb.AttributeType.STRING },
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      deployStage: props.deployStage,
    });

    const activityLog = new DynamodbTable(this, "activity-log", {
      tableName: `${props.deployStage}-kiko-activity-log`,
      partitionKey: { name: "tenant", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "dateTime", type: dynamodb.AttributeType.STRING },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      deployStage: props.deployStage,
    });

    this.recipientTable = new DynamodbTable(this, "recipients", {
      tableName: `${props.deployStage}-kiko-test-result-recipients`,
      partitionKey: { name: "tenant", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "address", type: dynamodb.AttributeType.STRING },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      deployStage: props.deployStage,
    });

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
