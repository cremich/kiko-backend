import * as cdk from "@aws-cdk/core";
import * as cloudfront from "@aws-cdk/aws-cloudfront";
import * as origins from "@aws-cdk/aws-cloudfront-origins";
import * as s3 from "@aws-cdk/aws-s3";

export class Hosting extends cdk.Construct {
  public distribution: cloudfront.Distribution;
  constructor(scope: cdk.Construct, id: string) {
    super(scope, id);
    const myBucket = new s3.Bucket(this, "frontend-bucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    this.distribution = new cloudfront.Distribution(this, "frontend-distribution", {
      defaultBehavior: { origin: new origins.S3Origin(myBucket) },
      defaultRootObject: "index.html",
    });
  }
}
