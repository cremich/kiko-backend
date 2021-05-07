import * as cdk from "@aws-cdk/core";
import * as cognito from "@aws-cdk/aws-cognito";
import * as cloudfront from "@aws-cdk/aws-cloudfront";
import * as dynamodb from "@aws-cdk/aws-dynamodb";

import { Tenant } from "./tenant";
import * as sns from "@aws-cdk/aws-sns";
import * as pinpoint from "@aws-cdk/aws-pinpoint";
import * as cloudwatch from "@aws-cdk/aws-cloudwatch";
import * as cwActions from "@aws-cdk/aws-cloudwatch-actions";
import * as lambdaNodejs from "@aws-cdk/aws-lambda-nodejs";
import * as path from "path";
import * as lambda from "@aws-cdk/aws-lambda";
import * as logs from "@aws-cdk/aws-logs";
import * as iam from "@aws-cdk/aws-iam";

interface TenantContext {
  readonly tenantName: string;
  readonly tenantDescription: string;
  readonly testPools: string[];
}

export interface TenantManagementProps {
  readonly poolTable: dynamodb.Table;
  readonly deployStage: string;
  readonly alarmTopic: sns.Topic;
  readonly tenants: TenantContext[];
  readonly cloudfrontDistribution: cloudfront.Distribution;
}

export class TenantManagement extends cdk.Construct {
  public userPool: cognito.UserPool;
  public webClient: cognito.UserPoolClient;
  public tenants: Tenant[] = [];
  public pinpointApplication: pinpoint.CfnApp;

  constructor(scope: cdk.Construct, id: string, props: TenantManagementProps) {
    super(scope, id);

    const emailBody = `Hallo {username},<br/>
    du hast eine Einladung zur Teilnahme an der KiKo-App erhalten. Dein temporäres Passwort lautet:<br/>
    <br/>
    {####}<br/>
    <br/>
    Bitte melde dich zunächst mit dieser E-Mail Adresse und deinem temporären Passwort unter<br/>
    <br/>
    https://${props.cloudfrontDistribution.distributionDomainName}<br/>
    <br/> 
    an. Du wirst anschließend aufgefordert, ein neues Passwort zu setzen. Dein temporäres Passwort ist 7 Tage gültig.<br/> 
    <br/>
    Dein KiKo-App Team! 
    `;

    this.userPool = new cognito.UserPool(this, "kiko-user-pool", {
      selfSignUpEnabled: false,
      userInvitation: {
        emailSubject: "Deine Einladung für die KiKo-App!",
        emailBody: emailBody,
      },
      signInAliases: {
        username: false,
        email: true,
        phone: false,
        preferredUsername: false,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: false,
        },
      },
    });

    if (props.deployStage !== "prod") {
      this.userPool.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    }

    this.webClient = this.userPool.addClient("web-client", {
      generateSecret: false,
      userPoolClientName: "kiko-web-client",
    });

    this.pinpointApplication = new pinpoint.CfnApp(this, "pinpoint-application", {
      name: "kiko",
    });

    new pinpoint.CfnSMSChannel(this, "pinpoint-sms-channel", {
      applicationId: this.pinpointApplication.ref,
      enabled: true,
      senderId: "KIKO",
    });

    const smsSendFailureMetric = new cloudwatch.Metric({
      namespace: "AWS/Pinpoint",
      metricName: "CampaignSendMessagePermanentFailure",
      period: cdk.Duration.minutes(1),
      statistic: "sum",
      dimensions: {
        Channel: "SMS",
        ApplicationId: this.pinpointApplication.ref,
      },
    });

    new cloudwatch.Alarm(this, "send-sms-failure-alarm", {
      metric: smsSendFailureMetric,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
    }).addAlarmAction(new cwActions.SnsAction(props.alarmTopic));

    props.tenants.forEach((tenant: TenantContext) => {
      const tenantConstruct = new Tenant(this, tenant.tenantName, {
        tenantName: tenant.tenantName,
        tenantDescription: tenant.tenantDescription,
        pinpointApplication: this.pinpointApplication,
        userPool: this.userPool,
        poolTable: props.poolTable,
        testPools: tenant.testPools,
      });

      this.tenants.push(tenantConstruct);
    });

    const onboardTenantFunction = new lambdaNodejs.NodejsFunction(this, "onboard-tenant-function", {
      entry: path.join(__dirname, "../lambdas", "onboard-tenant.ts"),
      handler: "handler",
      bundling: { externalModules: [], sourceMap: true, minify: true },
      runtime: lambda.Runtime.NODEJS_14_X,
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_DAY,
      timeout: cdk.Duration.seconds(12),
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ["mobiletargeting:CreateSegment"],
          resources: [`${this.pinpointApplication.attrArn}`],
        }),
        new iam.PolicyStatement({
          actions: ["cognito-idp:AdminCreateUser", "cognito-idp:AdminAddUserToGroup", "cognito-idp:CreateGroup"],
          resources: [`${this.userPool.userPoolArn}`],
        }),
      ],
    });

    props.poolTable.grantWriteData(onboardTenantFunction);

    onboardTenantFunction.addEnvironment("POOL_TABLE_NAME", props.poolTable.tableName);
    onboardTenantFunction.addEnvironment("PINPOINT_APPLICATION_ID", this.pinpointApplication.ref);
    onboardTenantFunction.addEnvironment("COGNITO_USER_POOL_ID", this.userPool.userPoolId);
  }
}
