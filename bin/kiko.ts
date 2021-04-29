#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import { PoolManagementStack } from "../lib/pool-management/stack";
import { TenantManagementStack } from "../lib/tenant-management/stack";
import { ApiStack } from "../lib/api/stack";
import { AmplifyStack } from "../lib/amplify/stack";

const app = new cdk.App();
const tags = app.node.tryGetContext("tags");
const deployStage = process.env.DEPLOY_STAGE || "dev";
cdk.Tags.of(app).add("project", tags.project);
cdk.Tags.of(app).add("stage", deployStage);

const poolManagement = new PoolManagementStack(app, `${deployStage}-kiko-pool-management`, {
  deployStage,
});

const tenantManagement = new TenantManagementStack(app, `${deployStage}-kiko-tenant-management`, {
  poolTable: poolManagement.poolTable,
  deployStage,
});

new ApiStack(app, `${deployStage}-kiko-api`, {
  userPool: tenantManagement.userPool,
  poolTable: poolManagement.poolTable,
  recipientTable: poolManagement.recipientTable,
  testResultProcessingStateMachine: poolManagement.testResultProcessingStateMachine,
});

if (deployStage === "prod") {
  new AmplifyStack(app, "kiko-amplify", {});
}
