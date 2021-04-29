import * as cdk from "@aws-cdk/core";
import "@aws-cdk/assert/jest";
import { anything, ResourcePart } from "@aws-cdk/assert";
import { AlarmInfra } from "../../../lib/shared/constructs/alarm-infra";
import { SubscriptionProtocol } from "@aws-cdk/aws-sns";

test("Alarm infra has SNS topic", () => {
  const app = new cdk.App();

  const stack = new AlarmInfra(app, "alarm-infra", {
    deployStage: "prod",
  });

  expect(stack).toHaveResource("AWS::SNS::Topic", {}, ResourcePart.CompleteDefinition);
});

describe("Alarm topic subscriptions", () => {
  test("created if email address supplied", () => {
    const app = new cdk.App();
    const mailAddress = "me@example.com";

    const stack = new AlarmInfra(app, "alarm-infra", {
      deployStage: "prod",
      commaSeperatedEmailAddresses: mailAddress,
    });

    expect(stack).toHaveResource(
      "AWS::SNS::Subscription",
      {
        Properties: {
          TopicArn: anything(),
          Protocol: SubscriptionProtocol.EMAIL,
          Endpoint: mailAddress,
        },
      },
      ResourcePart.CompleteDefinition
    );
  });

  test("created multiple if email addresses supplied", () => {
    const app = new cdk.App();

    const stack = new AlarmInfra(app, "alarm-infra", {
      deployStage: "prod",
      commaSeperatedEmailAddresses: "a@example.com, b@example.com,c@example.com",
    });

    expect(stack).toCountResources("AWS::SNS::Subscription", 3);
  });

  test("not created if no email addresses supplied", () => {
    const app = new cdk.App();

    const stack = new AlarmInfra(app, "alarm-infra", {
      deployStage: "prod",
    });

    expect(stack).toCountResources("AWS::SNS::Subscription", 0);
  });
});
