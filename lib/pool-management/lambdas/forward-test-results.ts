import { captureAWS } from "aws-xray-sdk";
import * as AWS from "aws-sdk";

interface ForwardTestResultEvent {
  readonly tenant: string;
  readonly poolName: string;
  readonly testResult: string;
}

captureAWS(AWS);

export const handler = async (event: ForwardTestResultEvent) => {
  const env = validateEnvironmentVars();
  const testPool = await readTestPoolFromDynamoDb(env.poolTableName, event.poolName, event.tenant);

  const testResult = event.testResult === "N" ? "NEGATIV" : "POSITIV";
  const messageBody = `Gruppe ${event.poolName} - SARS-CoV-2 Pool-Testergebnis: ${testResult}`;
  const date = new Date();
  const campaignName = `POOL_TEST_FWD_${event.poolName}_${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  const pinpointClient = new AWS.Pinpoint();
  const createCampaignResponse = await pinpointClient
    .createCampaign({
      ApplicationId: env.pinpointApplicationId,
      WriteCampaignRequest: {
        SegmentId: testPool.segmentId,
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
    campaignId: createCampaignResponse.CampaignResponse.Id,
    segmentId: createCampaignResponse.CampaignResponse.SegmentId,
    campaignStatus: createCampaignResponse.CampaignResponse.State?.CampaignStatus,
  };
};

function validateEnvironmentVars() {
  if (!process.env.POOL_TABLE_NAME) {
    throw new Error("Environment var POOL_TABLE_NAME not found.");
  }
  if (!process.env.PINPOINT_APPLICATION_ID) {
    throw new Error("Environment var PINPOINT_APPLICATION_ID not found.");
  }

  return {
    poolTableName: process.env.POOL_TABLE_NAME,
    pinpointApplicationId: process.env.PINPOINT_APPLICATION_ID,
  };
}

async function readTestPoolFromDynamoDb(tableName: string, poolName: string, tenant: string) {
  const dynamoDbClient = new AWS.DynamoDB.DocumentClient();
  const getItemResult = await dynamoDbClient.get({ TableName: tableName, Key: { tenant, poolName } }).promise();
  if (!getItemResult.Item) {
    throw new Error(`pool ${poolName} not found for tenant ${tenant}`);
  }

  return getItemResult.Item;
}
