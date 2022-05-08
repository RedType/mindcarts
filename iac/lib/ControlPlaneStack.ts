import { Construct } from 'constructs';
import * as path from 'path';

import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamo from 'aws-cdk-lib/aws-dynamodb';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as events from 'aws-cdk-lib/aws-events';
import * as gateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as targets from 'aws-cdk-lib/aws-events-targets';

const DEFAULT_TIMEOUT = cdk.Duration.minutes(20);

export interface ControlPlaneStackProps extends cdk.StackProps {
  readonly cluster: ecs.ICluster;
  readonly servers: {
    readonly serverName: string;
    readonly rconDnsName: string;
  }[];
  readonly timeoutDuration?: cdk.Duration;
}

export default class ControlPlaneStack extends cdk.Stack {
  readonly configTable: dynamo.ITable;

  constructor(scope: Construct, id: string, props: ControlPlaneStackProps) {
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

    this.configTable = new dynamo.Table(this, 'ConfigTable', {
      partitionKey: { name: 'serverId', type: dynamo.AttributeType.STRING },
      sortKey: { name: 'config', type: dynamo.AttributeType.STRING },
      billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
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
      environment: {
        CLUSTER_ARN: props.cluster.clusterArn,
        CONFIG_TABLE_NAME: this.configTable.tableName,
      },
    });

    this.configTable.grantWriteData(startServer.grantPrincipal);

    const timeoutServers = new lambda.NodejsFunction(this, 'TimeoutServersFn', {
      entry, depsLockFilePath,
      handler: 'TimeoutServers',
      description: 'Checks to see if any players are logged in, and if not, shuts down server',
    });

    timeout.addTarget(new targets.LambdaFunction(timeoutServers));
    this.configTable.grantReadWriteData(timeoutServers);

    const whitelistPlayer = new lambda.NodejsFunction(this, 'WhitelistPlayer', {
      entry, depsLockFilePath,
      handler: 'WhitelistPlayer',
      description: 'Adds a player to the server\'s whitelist (and removes their old account)',
    });

    this.configTable.grantReadWriteData(whitelistPlayer.grantPrincipal);

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
      .addMethod('POST', new gateway.LambdaIntegration(startServer, { proxy: true }), {
        authorizationType: gateway.AuthorizationType.COGNITO,
        authorizer: { authorizerId: user.ref },
      })
    ;

    // POST /whitelistPlayer
    api.root
      .addResource('whitelistPlayer')
      .addMethod('POST', new gateway.LambdaIntegration(whitelistPlayer, { proxy: true }), {
        authorizationType: gateway.AuthorizationType.COGNITO,
        authorizer: { authorizerId: user.ref },
      })
    ;
  }
}

