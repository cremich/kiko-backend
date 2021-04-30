import { captureAWSClient } from "aws-xray-sdk";
import * as AWS from "aws-sdk";

interface ForwardTestResultEvent {
  readonly tenant: string;
  readonly pinpointApplicationId: string;
  readonly segmentId: string;
  readonly poolName: string;
  readonly testResult: string;
}

const pinpointClient = captureAWSClient(new AWS.Pinpoint());

exports.handler = async function (event: ForwardTestResultEvent) {
  const testResult = event.testResult === "N" ? "NEGATIV" : "POSITIV";
  const messageBody = `Gruppe ${event.poolName} - SARS-CoV-2 Pool-Testergebnis: ${testResult}`;
  const date = new Date();
  const campaignName = `POOL_TEST_FWD_${event.poolName}_${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  const createCampaignResponse = await pinpointClient
    .createCampaign({
      ApplicationId: event.pinpointApplicationId,
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
    pinpointApplicationId: event.pinpointApplicationId,
    segmentId: event.segmentId,
    poolName: event.poolName,
    testResult: event.testResult,
  };
};
