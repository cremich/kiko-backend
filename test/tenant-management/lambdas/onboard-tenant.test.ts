import * as AWSMock from "aws-sdk-mock";
import * as AWS from "aws-sdk";
import { handler } from "../../../lib/tenant-management/lambdas/onboard-tenant";

const OLD_ENV = process.env;
const createSegmentSpy = jest.fn().mockResolvedValue({
  SegmentResponse: {
    Id: "mocked-segment-id",
  },
});

const adminCreateUserSpy = jest.fn().mockResolvedValue({});
const createGroupSpy = jest.fn().mockResolvedValue({});
const adminAddUserToGroupSpy = jest.fn().mockResolvedValue({});

beforeAll(async () => {
  process.env = { ...OLD_ENV };
  AWSMock.mock("Pinpoint", "createSegment", createSegmentSpy);
  AWSMock.mock("DynamoDB.DocumentClient", "put", jest.fn().mockResolvedValue({}));
  AWSMock.mock("CognitoIdentityServiceProvider", "adminCreateUser", adminCreateUserSpy);
  AWSMock.mock("CognitoIdentityServiceProvider", "createGroup", createGroupSpy);
  AWSMock.mock("CognitoIdentityServiceProvider", "adminAddUserToGroup", adminAddUserToGroupSpy);
});

beforeEach(async () => {
  process.env.PINPOINT_APPLICATION_ID = "PINPOINT_APPLICATION_ID";
  process.env.POOL_TABLE_NAME = "POOL_TABLE_NAME";
  process.env.COGNITO_USER_POOL_ID = "COGNITO_USER_POOL_ID";
  jest.restoreAllMocks();
  AWSMock.setSDKInstance(AWS);
});

afterAll(() => {
  process.env = OLD_ENV;
});

it("environment variables validation fails if pinpoint application id not provided", async () => {
  delete process.env.PINPOINT_APPLICATION_ID;
  const event = { tenantName: "testTenant", tenantEmail: "test-mail@example.com", poolNames: ["one", "two"] };
  await expect(handler(event)).rejects.toThrow("Environment var PINPOINT_APPLICATION_ID not found.");
});

it("environment variables validation fails if pool table name not provided", async () => {
  delete process.env.POOL_TABLE_NAME;
  const event = { tenantName: "testTenant", tenantEmail: "test-mail@example.com", poolNames: ["one", "two"] };
  await expect(handler(event)).rejects.toThrow("Environment var POOL_TABLE_NAME not found.");
});

it("environment variables validation fails if cognito user pool id not provided", async () => {
  delete process.env.COGNITO_USER_POOL_ID;
  const event = { tenantName: "testTenant", tenantEmail: "test-mail@example.com", poolNames: ["one", "two"] };
  await expect(handler(event)).rejects.toThrow("Environment var COGNITO_USER_POOL_ID not found.");
});

it("Pinpoint segments are created", async () => {
  const event = { tenantName: "testTenant", tenantEmail: "test-mail@example.com", poolNames: ["one", "two"] };

  const expectedPayloadToPinpoint = {
    ApplicationId: "PINPOINT_APPLICATION_ID",
    WriteSegmentRequest: {
      Name: `${event.tenantName}_two`,
      Dimensions: {
        Attributes: {
          Group: {
            Values: ["two"],
            AttributeType: "INCLUSIVE",
          },
          Tenant: {
            Values: [event.tenantName],
            AttributeType: "INCLUSIVE",
          },
        },
        Demographic: {
          Channel: {
            Values: ["SMS"],
            DimensionType: "INCLUSIVE",
          },
        },
      },
    },
  };

  await handler(event);
  expect(createSegmentSpy).toHaveBeenLastCalledWith(expectedPayloadToPinpoint, expect.anything());
  expect(createSegmentSpy).toHaveBeenCalledTimes(2);
});

it("Tenant user is created", async () => {
  const event = { tenantName: "testTenant", tenantEmail: "test-mail@example.com", poolNames: ["one", "two"] };

  const expectedPayloadToCognito = {
    UserPoolId: process.env.COGNITO_USER_POOL_ID,
    Username: event.tenantEmail,
    UserAttributes: [
      {
        Name: "email",
        Value: event.tenantEmail,
      },
    ],
    DesiredDeliveryMediums: ["EMAIL"],
  };

  await handler(event);
  expect(adminCreateUserSpy).toHaveBeenCalledWith(expectedPayloadToCognito, expect.anything());
});

it("Tenant user group is created", async () => {
  const event = { tenantName: "testTenant", tenantEmail: "test-mail@example.com", poolNames: ["one", "two"] };

  const expectedPayloadToCognito = {
    UserPoolId: process.env.COGNITO_USER_POOL_ID,
    GroupName: event.tenantName,
  };

  await handler(event);
  expect(createGroupSpy).toHaveBeenCalledWith(expectedPayloadToCognito, expect.anything());
});

it("Tenant user is added to group", async () => {
  const event = { tenantName: "testTenant", tenantEmail: "test-mail@example.com", poolNames: ["one", "two"] };

  const expectedPayloadToCognito = {
    UserPoolId: process.env.COGNITO_USER_POOL_ID,
    GroupName: event.tenantName,
    Username: event.tenantEmail,
  };

  await handler(event);
  expect(adminAddUserToGroupSpy).toHaveBeenCalledWith(expectedPayloadToCognito, expect.anything());
});
