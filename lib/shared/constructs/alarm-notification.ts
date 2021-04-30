import { v4 as uuid } from "uuid";
import * as cdk from "@aws-cdk/core";
import * as chatbot from "@aws-cdk/aws-chatbot";
import * as logs from "@aws-cdk/aws-logs";
import * as sns from "@aws-cdk/aws-sns";

interface AlarmNotificationProps {
  readonly emailAddress?: string;
  readonly slackWorkspaceId?: string;
  readonly slackChannelId?: string;
}

export class AlarmNotification extends cdk.Construct {
  public topic: sns.Topic;

  constructor(scope: cdk.Construct, id: string, props: AlarmNotificationProps) {
    super(scope, id);

    this.topic = new sns.Topic(this, "alarm-topic");

    if (props.emailAddress) {
      new sns.Subscription(this, "alarm-topic-email-subscription", {
        topic: this.topic,
        protocol: sns.SubscriptionProtocol.EMAIL,
        endpoint: props.emailAddress,
      });
    }

    if (props.slackChannelId && props.slackWorkspaceId) {
      new chatbot.SlackChannelConfiguration(this, "slack-channel", {
        slackChannelConfigurationName: `kiko-alerts-${props.slackWorkspaceId}-${props.slackChannelId}`,
        slackWorkspaceId: props.slackWorkspaceId,
        slackChannelId: props.slackChannelId,
        logRetention: logs.RetentionDays.ONE_DAY,
        //@ts-ignore typecasting seems not to work in current cdk version
        //maybe ignoring is not needed in future versions. To be checked
        notificationTopics: [this.topic],
      });
    }
  }
}
