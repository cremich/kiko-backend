import * as cdk from "@aws-cdk/core";
import { AlarmNotification } from "./shared/constructs/alarm-notification";

interface KikoStackProps extends cdk.StackProps {
  readonly slackWorkspaceId?: string;
  readonly slackChannelId?: string;
  readonly alertEmailAddress?: string;
}

export class KikoStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: KikoStackProps) {
    super(scope, id, props);

    const alarmNotification = new AlarmNotification(this, "alarm-notification", {
      slackChannelId: props?.slackChannelId,
      slackWorkspaceId: props?.slackWorkspaceId,
      emailAddress: props?.alertEmailAddress,
    });
  }
}
