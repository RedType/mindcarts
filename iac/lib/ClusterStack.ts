import { Construct } from 'constructs';

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';

export interface ClusterStackProps extends cdk.StackProps {
}

export default class ClusterStack extends cdk.Stack {
  readonly cluster: ecs.Cluster;
  readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props?: ClusterStackProps) {
    super(scope, id, props);

    const vpc = this.vpc = new ec2.Vpc(this, 'VPC');

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      capacity: {
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.SMALL),
        associatePublicIpAddress: true,
      },
    });
  }
}

