import * as AWSMock from "aws-sdk-mock";
import * as AWS from "aws-sdk";
import { handler } from "../../../lib/pool-management/lambdas/campaign-status";

const OLD_ENV = process.env;
const getCampaignActivitiesSpy = jest.fn().mockResolvedValue({
  ActivitiesResponse: {
    Item: [
      {
        CampaignId: "mocked-campaign-id",
        State: "PENDING",
        Result: "mocked-campaign-result",
        Start: "mocked-campaign-start",
        End: "mocked-campaign-end",
        SuccessfulEndpointCount: 1,
        TotalEndpointCount: 1,
      },
    ],
  },
});

beforeAll(async () => {
  process.env = { ...OLD_ENV };
  AWSMock.mock("Pinpoint", "getCampaignActivities", getCampaignActivitiesSpy);
});

beforeEach(async () => {
  process.env.PINPOINT_APPLICATION_ID = "PINPOINT_APPLICATION_ID";
  jest.restoreAllMocks();
  AWSMock.setSDKInstance(AWS);
});

afterAll(() => {
  process.env = OLD_ENV;
});

it("environment variables validation fails if pinpoint application id not provided", async () => {
  delete process.env.PINPOINT_APPLICATION_ID;
  const event = { campaignId: "mocked-campaign-id" };
  await expect(handler(event)).rejects.toThrow("Environment var PINPOINT_APPLICATION_ID not found.");
});

it("Campaign status is requested", async () => {
  const event = { campaignId: "mocked-campaign-id" };

  const expectedPayloadToPinpoint = {
    ApplicationId: "PINPOINT_APPLICATION_ID",
    CampaignId: event.campaignId,
  };

  await handler(event);
  expect(getCampaignActivitiesSpy).toHaveBeenCalledWith(expectedPayloadToPinpoint, expect.anything());
});

it("Campaign status is returned", async () => {
  const event = { campaignId: "mocked-campaign-id" };

  const result = await handler(event);
  expect(result.campaignStatus).toBe("PENDING");
  expect(result.campaignId).toBe("mocked-campaign-id");
});
