import { Construct } from 'constructs';

import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as gateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';

export interface ControlPanelApiStackProps extends cdk.StackProps {
  instance: ec2.IInstance;
}

export default class ControlPanelApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: ControlPanelApiStackProps) {
    super(scope, id, props);

    //////////////////
    // API Handlers //
    //////////////////

    const startServer = new lambda.NodejsFunction(this, 'StartServerFn', {
      entry: '../../lambdas/src/index.ts',
      depsLockFilePath: '../../lambdas/package-lock.json',
      handler: 'StartServer',
      description: 'Starts the Minecraft server',
    });

    const timeoutServer = new lambda.NodejsFunction(this, 'TimeoutServerFn', {
      entry: '../../lambdas/src/index.ts',
      depsLockFilePath: '../../lambdas/package-lock.json',
      handler: 'TimeoutServer',
      description: 'Checks to see if any players are logged in, and if not, shuts down server',
    });

    const whitelistPlayer = new lambda.NodejsFunction(this, 'WhitelistPlayer', {
      entry: '../../lambdas/src/index.ts',
      depsLockFilePath: '../../lambdas/package-lock.json',
      handler: 'WhitelistPlayer',
      description: 'Adds a player to the server\'s whitelist (and removes their old account)',
    });

    ///////////////
    // User Pool //
    ///////////////

    const userPool = new cognito.UserPool(this, 'UserPool');

    /////////////////
    // API Gateway //
    /////////////////

    const api = new gateway.RestApi(this, 'Api');

    const user = new gateway.CfnAuthorizer(this, 'UserAuthorizer', {
      name: 'UserAuthorizer',
      identitySource: 'method.request.header.Authorization',
      providerArns: [],
      restApiId: api.restApiId,
      type: gateway.AuthorizationType.COGNITO,
    });

    // GET /startServer
    api.root
      .addResource('startServer')
      .addMethod('GET', new gateway.LambdaIntegration(startServer), {
        authorizationType: gateway.AuthorizationType.COGNITO,
        authorizer: { authorizerId: user.ref },
      })
    ;

    // POST /whitelistPlayer
    api.root
      .addResource('whitelistPlayer')
      .addMethod('POST', new gateway.LambdaIntegration(whitelistPlayer), {
        authorizationType: gateway.AuthorizationType.COGNITO,
        authorizer: { authorizerId: user.ref },
      })
    ;
  }
}

