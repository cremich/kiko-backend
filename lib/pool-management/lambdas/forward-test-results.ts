import { captureAWSClient } from "aws-xray-sdk";
import * as AWS from "aws-sdk";

interface ForwardTestResultEvent {
  readonly tenant: string;
  readonly segmentId: string;
  readonly poolName: string;
  readonly testResult: string;
}

const pinpointClient = captureAWSClient(new AWS.Pinpoint());
const dynamoDbService = new AWS.DynamoDB();
const dynamoDbClient = new AWS.DynamoDB.DocumentClient({
  service: new AWS.DynamoDB(),
});

captureAWSClient(dynamoDbService);
const env = validateEnvironmentVars();

exports.handler = async function (event: ForwardTestResultEvent) {
  await throwErrorIfPoolNotExists(event.poolName, event.tenant);

  const testResult = event.testResult === "N" ? "NEGATIV" : "POSITIV";
  const messageBody = `Gruppe ${event.poolName} - SARS-CoV-2 Pool-Testergebnis: ${testResult}`;
  const date = new Date();
  const campaignName = `POOL_TEST_FWD_${event.poolName}_${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  const createCampaignResponse = await pinpointClient
    .createCampaign({
      ApplicationId: env.pinpointApplicationId,
      WriteCampaignRequest: {
        SegmentId: event.segmentId,
        Name: campaignName,
        MessageConfiguration: {
          SMSMessage: {
            Body: messageBody,
            MessageType: "TRANSACTIONAL",
            SenderId: "KIKO",
          },
        },
        Schedule: {
          StartTime: "IMMEDIATE",
        },
      },
    })
    .promise();

  return {
    tenant: event.tenant,
    campaignId: createCampaignResponse.CampaignResponse.Id,
    campaignName,
    segmentId: event.segmentId,
    poolName: event.poolName,
    testResult: event.testResult,
  };
};

function validateEnvironmentVars() {
  if (!process.env.POOL_TABLE_NAME) {
    throw new Error("Environment var 'POOL_TABLE_NAME' not found.");
  }
  if (!process.env.PINPOINT_APPLICATION_ID) {
    throw new Error("Environment var 'PINPOINT_APPLICATION_ID' not found.");
  }

  return {
    poolTableName: process.env.POOL_TABLE_NAME,
    pinpointApplicationId: process.env.PINPOINT_APPLICATION_ID,
  };
}

async function throwErrorIfPoolNotExists(poolName: string, tenant: string) {
  const getItemResult = await dynamoDbClient.get({ TableName: env.poolTableName, Key: { tenant, poolName } }).promise();
  if (!getItemResult.Item) {
    throw new Error(`pool ${poolName} not found for tenant ${tenant}`);
  }
}
