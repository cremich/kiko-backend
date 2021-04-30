import * as cdk from "@aws-cdk/core";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import { AlarmNotification } from "./shared/constructs/alarm-notification";
import { Databases } from "./pool-management/constructs/databases";
import { TestResultWorkflow } from "./pool-management/constructs/test-result-workflow";

interface KikoStackProps extends cdk.StackProps {
  readonly slackWorkspaceId?: string;
  readonly slackChannelId?: string;
  readonly alertEmailAddress?: string;
  readonly deployStage: string;
}

export class KikoStack extends cdk.Stack {
  private testPoolTable: dynamodb.Table;
  private activityLogTable: dynamodb.Table;

  constructor(scope: cdk.Construct, id: string, props?: KikoStackProps) {
    super(scope, id, props);

    const alarmNotification = new AlarmNotification(this, "alarm-notification", {
      slackChannelId: props?.slackChannelId,
      slackWorkspaceId: props?.slackWorkspaceId,
      emailAddress: props?.alertEmailAddress,
    });

    const databases = new Databases(this, "pool-databases", {
      tableRemovalPolicy: props?.deployStage === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    databases.tables.forEach((dynamoDbTable) => {
      if (dynamoDbTable.id === "test-pool") {
        this.testPoolTable = dynamoDbTable.table;
      } else if (dynamoDbTable.id === "activity-log") {
        this.activityLogTable = dynamoDbTable.table;
      }
    });

    new TestResultWorkflow(this, "test-result-workflow", {
      poolTable: this.testPoolTable,
      activityLog: this.activityLogTable,
      alarmTopic: alarmNotification.topic,
    });
  }
}
