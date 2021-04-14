import * as cdk from "@aws-cdk/core";
import * as codecommit from "@aws-cdk/aws-codecommit";
import * as amplify from "@aws-cdk/aws-amplify";

export class AmplifyStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const gitRepository = new codecommit.Repository(this, "repository", {
      repositoryName: "kiko-frontend",
      description: "KiKo App - Web Frontend",
    });

    const amplifyApp = new amplify.App(this, "amplify-app", {
      appName: "kiko-os",
      sourceCodeProvider: new amplify.CodeCommitSourceCodeProvider({
        repository: gitRepository,
      }),
    });
    amplifyApp.addBranch("main");
  }
}
