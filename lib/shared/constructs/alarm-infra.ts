import * as cdk from "@aws-cdk/core";
import { Stack } from "@aws-cdk/core";
import { ITopic, Subscription, SubscriptionProtocol, Topic } from "@aws-cdk/aws-sns";

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
      props.commaSeperatedEmailAddresses.split(",").forEach((mailAddress, idx) => {
        new Subscription(this, `${props.deployStage}-kiko-alarm-topic-subscription-${idx}`, {
          topic: this.topic,
          protocol: SubscriptionProtocol.EMAIL,
          endpoint: mailAddress,
        });
      });
    }
  }
}
