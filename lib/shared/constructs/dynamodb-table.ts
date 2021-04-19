import * as cdk from "@aws-cdk/core";
import * as dynamodb from "@aws-cdk/aws-dynamodb";

export interface DynamoDbProps extends dynamodb.TableProps {
  deployStage?: string;
}

export class DynamodbTable extends dynamodb.Table {
  constructor(scope: cdk.Construct, id: string, props: DynamoDbProps) {
    super(scope, id, props);

    if (props.deployStage !== "prod") {
      this.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    }
  }
}
