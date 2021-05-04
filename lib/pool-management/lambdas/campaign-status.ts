import { captureAWS } from "aws-xray-sdk";
import * as AWS from "aws-sdk";

interface CampaignStatusEvent {
  readonly campaignId: string;
}

captureAWS(AWS);

export const handler = async (event: CampaignStatusEvent) => {
  const env = validateEnvironmentVars();

  const pinpointClient = new AWS.Pinpoint();
  const campaignActivity = await pinpointClient
    .getCampaignActivities({
      ApplicationId: env.pinpointApplicationId,
      CampaignId: event.campaignId,
    })
    .promise();

  const activity = campaignActivity.ActivitiesResponse.Item[0];

  return {
    campaignId: activity.CampaignId,
    campaignStatus: activity.State,
    result: activity.Result,
    start: activity.Start,
    end: activity.End,
    successfulEndpointCount: activity.SuccessfulEndpointCount,
    totalEndpointCount: activity.TotalEndpointCount,
  };
};

function validateEnvironmentVars() {
  if (!process.env.PINPOINT_APPLICATION_ID) {
    throw new Error("Environment var PINPOINT_APPLICATION_ID not found.");
  }

  return {
    pinpointApplicationId: process.env.PINPOINT_APPLICATION_ID,
  };
}
