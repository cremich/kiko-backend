import * as cdk from "@aws-cdk/core";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import { CloudFrontToS3 } from "@aws-solutions-constructs/aws-cloudfront-s3";
import { AlarmNotification } from "./shared/constructs/alarm-notification";
import { Databases } from "./pool-management/constructs/databases";
import { TestResultWorkflow } from "./pool-management/constructs/test-result-workflow";
import { GraphqlApi } from "./api/constructs/graphql-api";
import { TenantManagement } from "./tenant-management/constructs/tenant-management";

interface KikoStackProps extends cdk.StackProps {
  readonly slackWorkspaceId?: string;
  readonly slackChannelId?: string;
  readonly alertEmailAddress?: string;
  readonly deployStage: string;
}

export class KikoStack extends cdk.Stack {
  private testPoolTable: dynamodb.Table;

  constructor(scope: cdk.Construct, id: string, props: KikoStackProps) {
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
      }
    });

    const tenantManagement = new TenantManagement(this, "tenant-management", {
      poolTable: this.testPoolTable,
      alarmTopic: alarmNotification.topic,
      deployStage: props.deployStage,
      tenants: this.node.tryGetContext("tenants"),
    });

    const testResultWorkflow = new TestResultWorkflow(this, "test-result-workflow", {
      poolTable: this.testPoolTable,
      alarmTopic: alarmNotification.topic,
      pinpointApplication: tenantManagement.pinpointApplication,
    });

    new GraphqlApi(this, "graphql-api", {
      userPool: tenantManagement.userPool,
      poolTable: this.testPoolTable,
      region: this.region,
      testResultWorkflow: testResultWorkflow.stateMachine,
    });

    new CloudFrontToS3(this, "hosting", {
      insertHttpSecurityHeaders: false,
      bucketProps: {
        websiteErrorDocument: "index.html",
        websiteIndexDocument: "index.html",
      },
    });
  }
}
