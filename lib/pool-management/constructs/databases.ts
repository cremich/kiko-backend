import * as cdk from "@aws-cdk/core";
import * as dynamodb from "@aws-cdk/aws-dynamodb";

interface DatabaseProps {
  readonly tableRemovalPolicy?: cdk.RemovalPolicy;
}

interface DynamoDbConfiguration {
  readonly id: string;
  readonly partitionKey: dynamodb.Attribute;
  readonly sortKey: dynamodb.Attribute;
}

interface DynamoDbTableListEntry {
  readonly id: string;
  readonly table: dynamodb.Table;
}

const dynamoDbConfiguration: DynamoDbConfiguration[] = [
  {
    id: "test-pool",
    partitionKey: { name: "tenant", type: dynamodb.AttributeType.STRING },
    sortKey: { name: "poolName", type: dynamodb.AttributeType.STRING },
  },
];

export class Databases extends cdk.Construct {
  public tables: DynamoDbTableListEntry[] = [];

  constructor(scope: cdk.Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    dynamoDbConfiguration.forEach((dynamoDbConfig) => {
      const table = new dynamodb.Table(this, dynamoDbConfig.id, {
        partitionKey: dynamoDbConfig.partitionKey,
        sortKey: dynamoDbConfig.sortKey,
        encryption: dynamodb.TableEncryption.AWS_MANAGED,
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: props.tableRemovalPolicy,
      });

      this.tables.push({
        id: dynamoDbConfig.id,
        table,
      });
    });

    //TODO: move to stack level
    // new cdk.CfnOutput(this, "test-result-processing-state-machine-arn", {
    //   value: this.testResultProcessingStateMachine.stateMachineArn,
    // });
  }
}
