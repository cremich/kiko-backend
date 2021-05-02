#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import { KikoStack } from "../lib/kiko.stack";

const app = new cdk.App();
const tags = app.node.tryGetContext("tags");
const deployStage = process.env.DEPLOY_STAGE || "dev";
cdk.Tags.of(app).add("project", tags.project);
cdk.Tags.of(app).add("stage", deployStage);

new KikoStack(app, `${deployStage}-kiko-app`, {
  alertEmailAddress: process.env.ALERT_EMAIL_ADDRESS,
  slackChannelId: process.env.SLACK_CHANNEL_ID,
  slackWorkspaceId: process.env.SLACK_WORKSPACE_ID,
  deployStage,
});
