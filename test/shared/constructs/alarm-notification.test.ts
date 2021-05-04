import * as cdk from "@aws-cdk/core";
import "@aws-cdk/assert/jest";
import * as sns from "@aws-cdk/aws-sns";
import { AlarmNotification } from "../../../lib/shared/constructs/alarm-notification";

let stack: cdk.Stack;

beforeEach(() => {
  stack = new cdk.Stack();
});

test("SNS topic created", () => {
  new AlarmNotification(stack, "alarm-notifications", {});
  expect(stack).toHaveResource("AWS::SNS::Topic", {});
});

test("Email subscription created if email address supplied", () => {
  const alarmNotification = new AlarmNotification(stack, "alarm-notifications", {
    emailAddress: "me@example.com",
  });

  expect(stack).toHaveResource("AWS::SNS::Subscription", {
    TopicArn: {
      Ref: stack.getLogicalId(alarmNotification.topic.node.defaultChild as sns.CfnTopic),
    },
    Protocol: sns.SubscriptionProtocol.EMAIL,
    Endpoint: "me@example.com",
  });
});

test("Email subscription not created if no email provided", () => {
  new AlarmNotification(stack, "alarm-notifications", {});

  expect(stack).toCountResources("AWS::SNS::Subscription", 0);
});

test("Chatbot slack channel configuration is created if slackIds provided", () => {
  const alarmNotification = new AlarmNotification(stack, "alarm-notifications", {
    slackWorkspaceId: "my-workspace",
    slackChannelId: "my-channel",
  });

  expect(stack).toHaveResource("AWS::Chatbot::SlackChannelConfiguration", {
    SlackChannelId: "my-channel",
    SlackWorkspaceId: "my-workspace",
    SnsTopicArns: [
      {
        Ref: stack.getLogicalId(alarmNotification.topic.node.defaultChild as sns.CfnTopic),
      },
    ],
  });
});

test("Chatbot slack channel configuration has fixed name to ensure it is not recreated", () => {
  new AlarmNotification(stack, "alarm-notifications", {
    slackWorkspaceId: "my-workspace",
    slackChannelId: "my-channel",
  });

  expect(stack).toHaveResource("AWS::Chatbot::SlackChannelConfiguration", {
    ConfigurationName: "kiko-alerts-my-workspace-my-channel",
  });
});

test("Chatbot slack channel not created if workspace id missing", () => {
  new AlarmNotification(stack, "alarm-notifications", {
    slackChannelId: "my-channel",
  });

  expect(stack).toCountResources("AWS::Chatbot::SlackChannelConfiguration", 0);
});

test("Chatbot slack channel not created if channel id missing", () => {
  new AlarmNotification(stack, "alarm-notifications", {
    slackWorkspaceId: "my-workspace",
  });

  expect(stack).toCountResources("AWS::Chatbot::SlackChannelConfiguration", 0);
});

// test("Chatbot log retention is set to one day", () => {
//   new AlarmNotification(stack, "alarm-notifications", {
//     slackWorkspaceId: "my-workspace",
//     slackChannelId: "my-channel",
//   });
//
//   expect(stack).toHaveResource("AWS::Logs::LogGroup", {
//     RetentionInDays: 1,
//   });
// });
