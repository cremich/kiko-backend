import { captureAWS } from "aws-xray-sdk";
import * as AWS from "aws-sdk";

interface OnboardTenantEvent {
  readonly tenantName: string;
  readonly tenantEmail: string;
  readonly poolNames: string[];
}

captureAWS(AWS);

export const handler = async (event: OnboardTenantEvent) => {
  const env = validateEnvironmentVars();

  const dynamoDbClient = new AWS.DynamoDB.DocumentClient();
  const pinpointClient = new AWS.Pinpoint();

  // create pinpoint segments and test pools
  for (const poolName of event.poolNames) {
    const segment = await pinpointClient
      .createSegment({
        ApplicationId: env.pinpointApplicationId,
        WriteSegmentRequest: {
          Name: `${event.tenantName}_${poolName}`,
          Dimensions: {
            Attributes: {
              Group: {
                Values: [poolName],
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
      })
      .promise();

    await dynamoDbClient
      .put({
        TableName: env.poolTableName,
        Item: {
          tenant: event.tenantName,
          poolName: poolName,
          segmentId: segment.SegmentResponse.Id,
        },
      })
      .promise();
  }

  // create cognito group
  const cognitoClient = new AWS.CognitoIdentityServiceProvider();

  const user = await cognitoClient
    .adminCreateUser({
      UserPoolId: env.userPoolId,
      Username: event.tenantEmail,
      UserAttributes: [
        {
          Name: "email",
          Value: event.tenantEmail,
        },
      ],
      DesiredDeliveryMediums: ["EMAIL"],
    })
    .promise();

  const userGroup = await cognitoClient
    .createGroup({
      GroupName: event.tenantName,
      UserPoolId: env.userPoolId,
    })
    .promise();

  const userGroupRelation = await cognitoClient
    .adminAddUserToGroup({
      GroupName: event.tenantName,
      UserPoolId: env.userPoolId,
      Username: event.tenantEmail,
    })
    .promise();

  return {
    user,
    userGroup,
    userGroupRelation,
  };
};

function validateEnvironmentVars() {
  if (!process.env.POOL_TABLE_NAME) {
    throw new Error("Environment var POOL_TABLE_NAME not found.");
  }
  if (!process.env.PINPOINT_APPLICATION_ID) {
    throw new Error("Environment var PINPOINT_APPLICATION_ID not found.");
  }
  if (!process.env.COGNITO_USER_POOL_ID) {
    throw new Error("Environment var COGNITO_USER_POOL_ID not found.");
  }

  return {
    poolTableName: process.env.POOL_TABLE_NAME,
    pinpointApplicationId: process.env.PINPOINT_APPLICATION_ID,
    userPoolId: process.env.COGNITO_USER_POOL_ID,
  };
}
