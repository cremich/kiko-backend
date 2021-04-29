import * as cdk from "@aws-cdk/core";
import * as pinpoint from "@aws-cdk/aws-pinpoint";
import * as cognito from "@aws-cdk/aws-cognito";
import * as cr from "@aws-cdk/custom-resources";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as iam from "@aws-cdk/aws-iam";

export interface TenantProps {
  tenantName: string;
  tenantDescription: string;
  pinpointApplication: pinpoint.CfnApp;
  userPool: cognito.UserPool;
  poolTable: dynamodb.Table;
  testPools: string[];
}

interface PoolItemPutRequest {
  PutRequest: {
    Item: {
      tenant: { S: string };
      poolName: { S: string };
      segmentId: { S: string };
    };
  };
}

export class Tenant extends cdk.Construct {
  public userPoolGroup: cognito.CfnUserPoolGroup;

  constructor(scope: cdk.Construct, id: string, props: TenantProps) {
    super(scope, id);

    this.userPoolGroup = new cognito.CfnUserPoolGroup(this, "user-pool-group", {
      description: props.tenantDescription,
      groupName: props.tenantName,
      userPoolId: props.userPool.userPoolId,
    });

    const poolItemsPutRequests: PoolItemPutRequest[] = [];

    props.testPools.forEach((testPool) => {
      const createSegment = new cr.AwsCustomResource(this, `${testPool}-segment`, {
        onCreate: {
          service: "Pinpoint",
          action: "createSegment",
          parameters: {
            ApplicationId: props.pinpointApplication.ref,
            WriteSegmentRequest: {
              Name: `${props.tenantName}_${testPool}`,
              Dimensions: {
                Attributes: {
                  Group: {
                    Values: [testPool],
                    AttributeType: "INCLUSIVE",
                  },
                  Tenant: {
                    Values: [props.tenantName],
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
          },
          physicalResourceId: cr.PhysicalResourceId.of(`${props.tenantName}-${testPool}-segment`),
        },
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            actions: ["mobiletargeting:CreateSegment"],
            resources: [props.pinpointApplication.attrArn],
          }),
        ]),
      });

      const segmentId = createSegment.getResponseField("SegmentResponse.Id");
      poolItemsPutRequests.push(this.generatePoolItemPutRequest(props.tenantName, testPool, segmentId));
    });

    if (poolItemsPutRequests.length > 0) {
      new cr.AwsCustomResource(this, "initial-pools", {
        onCreate: {
          service: "DynamoDB",
          action: "batchWriteItem",
          parameters: {
            RequestItems: {
              [props.poolTable.tableName]: poolItemsPutRequests,
            },
          },
          physicalResourceId: cr.PhysicalResourceId.of(`${props.tenantName}_initial_pools`),
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE }),
      });
    }
  }

  private generatePoolItemPutRequest = (
    tenantName: string,
    poolName: string,
    segmentId: string
  ): PoolItemPutRequest => {
    return {
      PutRequest: {
        Item: {
          tenant: {
            S: tenantName,
          },
          poolName: {
            S: poolName,
          },
          segmentId: { S: segmentId },
        },
      },
    };
  };
}
