import { Construct } from 'constructs';
import * as path from 'path';

import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamo from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as events from 'aws-cdk-lib/aws-events';
import * as gateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as targets from 'aws-cdk-lib/aws-events-targets';

const DEFAULT_TIMEOUT = cdk.Duration.minutes(20);

export interface ControlPanelApiStackProps extends cdk.StackProps {
  readonly timeoutDuration?: cdk.Duration;
}

export default class ControlPanelApiStack extends cdk.Stack {
  readonly rconPeers: ec2.IConnectable[];

  constructor(scope: Construct, id: string, props?: ControlPanelApiStackProps) {
    super(scope, id, props);

    //////////////////
    // TimeoutEvent //
    //////////////////

    const timeout = new events.Rule(this, 'TimeoutRule', {
      enabled: false, // to be enabled by GET /startServer
      schedule: events.Schedule.rate(props?.timeoutDuration ?? DEFAULT_TIMEOUT),
    });

    //////////////////
    // Config Table //
    //////////////////

    const configTable = new dynamo.Table(this, 'ConfigTable', {
      partitionKey: { name: 'id', type: dynamo.AttributeType.STRING },
    });

    //////////////////
    // API Handlers //
    //////////////////

    const entry = path.join(__dirname, '../../lambdas/src/index.ts');
    const depsLockFilePath = path.join(__dirname, '../../lambdas/package-lock.json');

    const startServer = new lambda.NodejsFunction(this, 'StartServerFn', {
      entry, depsLockFilePath,
      handler: 'StartServer',
      description: 'Starts the Minecraft server',
    });

    const timeoutServers = new lambda.NodejsFunction(this, 'TimeoutServersFn', {
      entry, depsLockFilePath,
      handler: 'TimeoutServers',
      description: 'Checks to see if any players are logged in, and if not, shuts down server',
    });

    timeout.addTarget(new targets.LambdaFunction(timeoutServers));

    const whitelistPlayer = new lambda.NodejsFunction(this, 'WhitelistPlayer', {
      entry, depsLockFilePath,
      handler: 'WhitelistPlayer',
      description: 'Adds a player to the server\'s whitelist (and removes their old account)',
    });

    configTable.grantReadWriteData(whitelistPlayer.grantPrincipal);

    this.rconPeers = [startServer, timeoutServers, whitelistPlayer];

    /////////////////////
    // User Identities //
    /////////////////////

    const userPool = new cognito.UserPool(this, 'UserPool');

    /////////////////
    // API Gateway //
    /////////////////

    const api = new gateway.RestApi(this, 'Api');

    const user = new gateway.CfnAuthorizer(this, 'UserAuthorizer', {
      name: 'UserAuthorizer',
      identitySource: 'method.request.header.Authorization',
      providerArns: [userPool.userPoolArn],
      restApiId: api.restApiId,
      type: gateway.AuthorizationType.COGNITO,
    });

    /////////////
    // Methods //
    /////////////

    // POST /startServer
    api.root
      .addResource('startServer')
      .addMethod('POST', new gateway.LambdaIntegration(startServer), {
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

