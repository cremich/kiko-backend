import * as cdk from "@aws-cdk/core";
import { Stack } from "@aws-cdk/core";
import { ITopic, Subscription, SubscriptionProtocol, Topic } from "@aws-cdk/aws-sns";
import { createHash } from "crypto";

interface TopicEmailSubscriptionsProps {
  readonly deployStage: string;
  readonly commaSeperatedEmailAddresses?: string;
}

export class AlarmInfra extends Stack {
  public topic: ITopic;

  constructor(scope: cdk.Construct, id: string, props: TopicEmailSubscriptionsProps) {
    super(scope, id);

    this.topic = new Topic(this, `${props.deployStage}-kiko-alarm-topic`);

    if (props.commaSeperatedEmailAddresses) {
      props.commaSeperatedEmailAddresses
        .split(",")
        .map((mailAddress) => mailAddress.trim())
        .forEach((mailAddress) => {
          const mailHash = createHash("md5").update(mailAddress).digest("hex");

          new Subscription(this, `${props.deployStage}-kiko-alarm-topic-subscription-${mailHash}`, {
            topic: this.topic,
            protocol: SubscriptionProtocol.EMAIL,
            endpoint: mailAddress,
          });
        });
    }
  }
}
