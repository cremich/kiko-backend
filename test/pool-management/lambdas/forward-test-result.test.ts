import * as AWSMock from "aws-sdk-mock";
import * as AWS from "aws-sdk";
import { GetItemInput } from "aws-sdk/clients/dynamodb";
import { handler } from "../../../lib/pool-management/lambdas/forward-test-results";

const OLD_ENV = process.env;
const createCampaignSpy = jest.fn().mockResolvedValue({
  CampaignResponse: {
    Id: "mocked-campaign-id",
    ApplicationId: "mocked-application-id",
    Arn: "mocked-arn",
    CreationDate: "mocked-creation-date",
    SegmentId: "mocked-segment-id",
    LastModifiedDate: "mocked-last-modified-date",
    SegmentVersion: 1,
  },
});

beforeAll(async () => {
  process.env = { ...OLD_ENV };
  AWSMock.mock("Pinpoint", "createCampaign", createCampaignSpy);
});

beforeEach(async () => {
  process.env.POOL_TABLE_NAME = "POOL_TABLE_NAME";
  process.env.PINPOINT_APPLICATION_ID = "PINPOINT_APPLICATION_ID";
  jest.restoreAllMocks();
  AWSMock.setSDKInstance(AWS);
});

afterAll(() => {
  process.env = OLD_ENV;
});

it("environment variables validation fails if pool table name not provided", async () => {
  delete process.env.POOL_TABLE_NAME;
  const event = { tenant: "test", poolName: "unknown", testResult: "N" };
  await expect(handler(event)).rejects.toThrow("Environment var POOL_TABLE_NAME not found.");
});

it("environment variables validation fails if pinpoint application id not provided", async () => {
  delete process.env.PINPOINT_APPLICATION_ID;
  const event = { tenant: "test", poolName: "unknown", testResult: "N" };
  await expect(handler(event)).rejects.toThrow("Environment var PINPOINT_APPLICATION_ID not found.");
});

it("throw error if pool not exists for tenant", async () => {
  AWSMock.mock("DynamoDB.DocumentClient", "get", (params: GetItemInput, callback: any) => {
    callback(null, {});
  });
  const event = { tenant: "test", poolName: "unknown", testResult: "N" };
  await expect(handler(event)).rejects.toThrow("pool unknown not found for tenant test");
  AWSMock.restore("DynamoDB.DocumentClient");
});

it("campaign is created for valid test pool", async () => {
  const event = { tenant: "test", poolName: "known", testResult: "N" };

  AWSMock.mock("DynamoDB.DocumentClient", "get", (params: GetItemInput, callback: any) => {
    callback(null, { Item: { tenant: event.tenant, poolName: event.poolName, segmentId: "mocked-segment-id" } });
  });
  const forwardTestResult = await handler(event);
  expect(forwardTestResult.campaignId).toBe("mocked-campaign-id");
  expect(forwardTestResult.segmentId).toBe("mocked-segment-id");
  AWSMock.restore("DynamoDB.DocumentClient");
});

it("SMS message for negative tests reflects test result and pool name", async () => {
  const event = { tenant: "test", poolName: "known", testResult: "N" };
  const date = new Date();
  const campaignName = `POOL_TEST_FWD_${event.poolName}_${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  const expectedPayloadToPinpoint = {
    ApplicationId: "PINPOINT_APPLICATION_ID",
    WriteCampaignRequest: {
      MessageConfiguration: {
        SMSMessage: {
          Body: "Gruppe known - SARS-CoV-2 Pool-Testergebnis: NEGATIV",
          MessageType: "TRANSACTIONAL",
          SenderId: "KIKO",
        },
      },
      Name: campaignName,
      Schedule: {
        StartTime: "IMMEDIATE",
      },
      SegmentId: "mocked-segment-id",
    },
  };

  AWSMock.mock("DynamoDB.DocumentClient", "get", (params: GetItemInput, callback: any) => {
    callback(null, { Item: { tenant: event.tenant, poolName: event.poolName, segmentId: "mocked-segment-id" } });
  });
  await handler(event);
  expect(createCampaignSpy).toHaveBeenCalledWith(expectedPayloadToPinpoint, expect.anything());
  AWSMock.restore("DynamoDB.DocumentClient");
});

it("SMS message for positive tests reflects test result and pool name", async () => {
  const event = { tenant: "test", poolName: "known", testResult: "P" };
  const date = new Date();
  const campaignName = `POOL_TEST_FWD_${event.poolName}_${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  const expectedPayloadToPinpoint = {
    ApplicationId: "PINPOINT_APPLICATION_ID",
    WriteCampaignRequest: {
      MessageConfiguration: {
        SMSMessage: {
          Body: "Gruppe known - SARS-CoV-2 Pool-Testergebnis: POSITIV",
          MessageType: "TRANSACTIONAL",
          SenderId: "KIKO",
        },
      },
      Name: campaignName,
      Schedule: {
        StartTime: "IMMEDIATE",
      },
      SegmentId: "mocked-segment-id",
    },
  };

  AWSMock.mock("DynamoDB.DocumentClient", "get", (params: GetItemInput, callback: any) => {
    callback(null, { Item: { tenant: event.tenant, poolName: event.poolName, segmentId: "mocked-segment-id" } });
  });
  await handler(event);
  expect(createCampaignSpy).toHaveBeenCalledWith(expectedPayloadToPinpoint, expect.anything());
  AWSMock.restore("DynamoDB.DocumentClient");
});
