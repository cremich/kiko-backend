#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";

const app = new cdk.App();
const tags = app.node.tryGetContext("tags");
const deployStage = process.env.DEPLOY_STAGE || "dev";
cdk.Tags.of(app).add("project", tags.project);
cdk.Tags.of(app).add("stage", deployStage);
//
// const alarmInfra = new AlarmInfra(app, `${deployStage}-kiko-alarm-infra`, {
//   deployStage,
//   commaSeperatedEmailAddresses: process.env.ALARM_SUBSCRIPTION_EMAIL_ADDRESSES,
// });
//
// const poolManagement = new PoolManagementStack(app, `${deployStage}-kiko-pool-management`, {
//   deployStage,
// });
//
// const tenantManagement = new TenantManagementStack(app, `${deployStage}-kiko-tenant-management`, {
//   poolTable: poolManagement.poolTable,
//   deployStage,
//   alarmTopic: alarmInfra.topic,
// });
//
// new ApiStack(app, `${deployStage}-kiko-api`, {
//   userPool: tenantManagement.userPool,
//   poolTable: poolManagement.poolTable,
//   testResultProcessingStateMachine: poolManagement.testResultProcessingStateMachine,
// });
//
// if (deployStage === "prod") {
//   new AmplifyStack(app, "kiko-amplify", {});
// }
