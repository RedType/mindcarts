import { Construct } from 'constructs';
import * as path from 'path';

import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as dynamo from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';

export interface ConfigRecordProviderProps extends cdk.StackProps {
  readonly configTable: dynamo.ITable;
}

export interface ResourceProps {
  readonly serverId: string;
}

export default class ConfigRecordProvider extends cdk.Stack {
  private handler: lambda.NodejsFunction;
  private provider: cr.Provider;

  constructor(scope: Construct, id: string, props: ConfigRecordProviderProps) {
    super(scope, id, props);

    const entry = path.join(__dirname, '../../lambdas/src/index.ts');
    const depsLockFilePath = path.join(__dirname, '../../lambdas/package-lock.json');

    this.handler = new lambda.NodejsFunction(this, 'ConfigRecHandlerFn', {
      entry, depsLockFilePath,
      handler: 'index.ConfigRecResouceHandler',
      timeout: cdk.Duration.minutes(1),
      environment: {
        CONFIG_TABLE_NAME: props.configTable.tableName,
      },
    });
    props.configTable.grantReadWriteData(this.handler.grantPrincipal);

    this.provider = new cr.Provider(this, 'ConfigRecResourceProvider', {
      onEventHandler: this.handler,
    });
  }

  public getResource(id: string, properties: ResourceProps) {
    return new cdk.CustomResource(this, id, {
      serviceToken: this.provider.serviceToken,
      properties,
    });
  }
}

