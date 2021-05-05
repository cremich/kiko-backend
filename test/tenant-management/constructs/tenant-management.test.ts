import * as cdk from "@aws-cdk/core";
import "@aws-cdk/assert/jest";
import * as cloudfront from "@aws-cdk/aws-cloudfront";
import * as origins from "@aws-cdk/aws-cloudfront-origins";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as sns from "@aws-cdk/aws-sns";
import { TenantManagement, TenantManagementProps } from "../../../lib/tenant-management/constructs/tenant-management";
import * as cognito from "@aws-cdk/aws-cognito";

let stack: cdk.Stack;
let props: TenantManagementProps;

beforeEach(() => {
  stack = new cdk.Stack();
  props = {
    alarmTopic: new sns.Topic(stack, "alarm-topic", {}),
    poolTable: new dynamodb.Table(stack, "pool-table", {
      partitionKey: { name: "tenant", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "poolName", type: dynamodb.AttributeType.STRING },
    }),
    deployStage: "test",
    tenants: [],
    cloudfrontDistribution: new cloudfront.Distribution(stack, "cloudfront-distribution", {
      defaultBehavior: { origin: new origins.HttpOrigin("www.example.com") },
    }),
  };
});

test("Cognito user pool created with self signup deactivated", () => {
  new TenantManagement(stack, "tenant-management", props);

  expect(stack).toHaveResourceLike("AWS::Cognito::UserPool", {
    AdminCreateUserConfig: {
      AllowAdminCreateUserOnly: true,
    },
  });
});

test("Cognito user pool schema contains only email address", () => {
  new TenantManagement(stack, "tenant-management", props);

  expect(stack).toHaveResourceLike("AWS::Cognito::UserPool", {
    Schema: [
      {
        Mutable: false,
        Name: "email",
        Required: true,
      },
    ],
  });
});

test("Cognito user pool resource is not replaced due to logical id change", () => {
  const tenantManagement = new TenantManagement(stack, "tenant-management", props);

  const userPoolLogicalId = stack.getLogicalId(tenantManagement.userPool.node.defaultChild as cognito.CfnUserPool);
  expect(userPoolLogicalId).toEqual("tenantmanagementkikouserpool9AC1D4C7");
});

test("Cognito user pool sign in alias set to email", () => {
  new TenantManagement(stack, "tenant-management", props);

  expect(stack).toHaveResourceLike("AWS::Cognito::UserPool", {
    UsernameAttributes: ["email"],
  });
});

test("Cognito user pool has web client configured", () => {
  const tenantManagement = new TenantManagement(stack, "tenant-management", props);
  const userPoolLogicalId = stack.getLogicalId(tenantManagement.userPool.node.defaultChild as cognito.CfnUserPool);

  expect(stack).toHaveResourceLike("AWS::Cognito::UserPoolClient", {
    ClientName: "kiko-web-client",
    UserPoolId: {
      Ref: userPoolLogicalId,
    },
  });
});

test("Pinpoint application created", () => {
  new TenantManagement(stack, "tenant-management", props);

  expect(stack).toHaveResource("AWS::Pinpoint::App", {
    Name: "kiko",
  });
});

test("Pinpoint application resource is not replaced due to logical id change", () => {
  const tenantManagement = new TenantManagement(stack, "tenant-management", props);

  const pinpointLogicalId = stack.getLogicalId(tenantManagement.pinpointApplication);
  expect(pinpointLogicalId).toEqual("tenantmanagementpinpointapplicationAF757B26");
});

test("SMS channel created", () => {
  const tenantManagement = new TenantManagement(stack, "tenant-management", props);

  const pinpointLogicalId = stack.getLogicalId(tenantManagement.pinpointApplication);

  expect(stack).toHaveResource("AWS::Pinpoint::SMSChannel", {
    Enabled: true,
    SenderId: "KIKO",
    ApplicationId: {
      Ref: pinpointLogicalId,
    },
  });
});

test("CampaignSendMessagePermanentFailure alarm is activated", () => {
  const tenantManagement = new TenantManagement(stack, "tenant-management", props);

  const pinpointLogicalId = stack.getLogicalId(tenantManagement.pinpointApplication);
  const topicLogicalId = stack.getLogicalId(props.alarmTopic.node.defaultChild as sns.CfnTopic);

  expect(stack).toHaveResource("AWS::CloudWatch::Alarm", {
    ComparisonOperator: "GreaterThanOrEqualToThreshold",
    EvaluationPeriods: 1,
    AlarmActions: [
      {
        Ref: topicLogicalId,
      },
    ],
    DatapointsToAlarm: 1,
    Dimensions: [
      {
        Name: "ApplicationId",
        Value: {
          Ref: pinpointLogicalId,
        },
      },
      {
        Name: "Channel",
        Value: "SMS",
      },
    ],
    MetricName: "CampaignSendMessagePermanentFailure",
    Namespace: "AWS/Pinpoint",
    Period: 60,
    Statistic: "Sum",
    Threshold: 1,
  });
});
