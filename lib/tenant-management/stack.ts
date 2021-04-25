import * as cdk from "@aws-cdk/core";
import * as cognito from "@aws-cdk/aws-cognito";
import * as dynamodb from "@aws-cdk/aws-dynamodb";

import { Tenant } from "./constructs/tenant";
import { ITopic } from "@aws-cdk/aws-sns";

interface TenantContext {
  readonly tenantName: string;
  readonly tenantDescription: string;
  readonly testPools: string[];
}

interface TenantManagementStackProps extends cdk.StackProps {
  readonly poolTable: dynamodb.Table;
  readonly deployStage: string;
  readonly alarmTopic: ITopic;
}

export class TenantManagementStack extends cdk.Stack {
  public userPool: cognito.UserPool;

  constructor(scope: cdk.Construct, id: string, props: TenantManagementStackProps) {
    super(scope, id, props);

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

    const webClient = this.userPool.addClient("web-client", {
      generateSecret: false,
      userPoolClientName: "kiko-web-client",
      oAuth: {
        callbackUrls: ["http://localhost:8080"],
        logoutUrls: ["http://localhost:8080"],
      },
    });

    this.node.tryGetContext("tenants").forEach((tenant: TenantContext) => {
      const tenantConstruct = new Tenant(this, tenant.tenantName, {
        tenantName: tenant.tenantName,
        tenantDescription: tenant.tenantDescription,
        userPool: this.userPool,
        poolTable: props.poolTable,
        testPools: tenant.testPools,
        alarmTopic: props.alarmTopic,
      });

      new cdk.CfnOutput(this, `${tenant.tenantName}-pinpoint-application-id`, {
        value: tenantConstruct.pinpointApplication.ref,
      });
      new cdk.CfnOutput(this, `${tenant.tenantName}-user-pool-group`, {
        value: tenantConstruct.userPoolGroup.groupName || "",
      });
    });

    new cdk.CfnOutput(this, "project-region", { value: this.region });
    new cdk.CfnOutput(this, "cognito-region", { value: this.region });
    new cdk.CfnOutput(this, "cognito-user-pool-id", { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, "cognito-web-client-id", { value: webClient.userPoolClientId });
  }
}
