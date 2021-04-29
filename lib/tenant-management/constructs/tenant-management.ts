import * as cdk from "@aws-cdk/core";
import * as cognito from "@aws-cdk/aws-cognito";
import * as dynamodb from "@aws-cdk/aws-dynamodb";

import { Tenant } from "./tenant";
import * as sns from "@aws-cdk/aws-sns";
import * as pinpoint from "@aws-cdk/aws-pinpoint";
import * as cloudwatch from "@aws-cdk/aws-cloudwatch";
import * as cwActions from "@aws-cdk/aws-cloudwatch-actions";

interface TenantContext {
  readonly tenantName: string;
  readonly tenantDescription: string;
  readonly testPools: string[];
}

interface TenantManagementProps {
  readonly poolTable: dynamodb.Table;
  readonly deployStage: string;
  readonly alarmTopic: sns.Topic;
  readonly tenants: TenantContext[];
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
    Bitte melde dich zunächst mit dieser E-Mail Adresse und deinem temporären Password an. Du wirst anschließend
    aufgefordert, ein neues Passwort zu setzen. Dein temporäres Passwort ist 7 Tage gültig.<br/> 
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

      //TODO: move to main stack
      //   new cdk.CfnOutput(this, `${tenant.tenantName}-pinpoint-application-id`, {
      //     value: tenantConstruct.pinpointApplication.ref,
      //   });
      //   new cdk.CfnOutput(this, `${tenant.tenantName}-user-pool-group`, {
      //     value: tenantConstruct.userPoolGroup.groupName || "",
      //   });
    });

    // new cdk.CfnOutput(this, "project-region", { value: this.region });
    // new cdk.CfnOutput(this, "cognito-region", { value: this.region });
    // new cdk.CfnOutput(this, "cognito-user-pool-id", { value: this.userPool.userPoolId });
    // new cdk.CfnOutput(this, "cognito-web-client-id", { value: webClient.userPoolClientId });
  }
}
