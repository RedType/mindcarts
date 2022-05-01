import { Construct } from 'constructs';

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';

export interface MinecraftStackProps extends cdk.StackProps { }

export default class MinecraftStack extends cdk.Stack {
  public readonly server: ec2.Instance;
  public readonly vpc: ec2.Vpc;
  // lambdas for programmatic server interaction
  public readonly startServer: lambda.Function;
  public readonly timeoutServer: lambda.Function;
  public readonly whitelistPlayer: lambda.Function;

  constructor(scope: Construct, id: string, props?: MinecraftStackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'VPC');

    const firewall = new ec2.SecurityGroup(this, 'MinecraftServerFirewall', {
      vpc,
      allowAllOutbound: false,
    });
    firewall.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(25565), 'Minecraft Server IPv4');
    firewall.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(25565), 'Minecraft Server IPv6');
    firewall.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH IPv4');
    firewall.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(22), 'SSH IPv6');
    firewall.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.icmpPing(), 'Ping IPv4');
    firewall.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.icmpPing(), 'Ping IPv6');

    this.server = new ec2.Instance(this, 'MinecraftServer', {
      // hardware
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.SMALL),
      machineImage: ec2.MachineImage.genericLinux({
        'us-east-1': 'ami-0b0ea68c435eb488d', // Ubuntu 16.04 LTS amd64
      }),

      // networking
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroup: firewall,
      keyName: 'minecraft-server',
    });

    this.startServer = new lambdaNode.NodejsFunction(this, 'StartServerFn', {
      entry: '../../lambdas/src/index.ts',
      depsLockFilePath: '../../lambdas/package-lock.json',
      handler: 'StartServer',
      description: 'Starts the Minecraft server',
    });

    this.timeoutServer = new lambdaNode.NodejsFunction(this, 'TimeoutServerFn', {
      entry: '../../lambdas/src/index.ts',
      depsLockFilePath: '../../lambdas/package-lock.json',
      handler: 'TimeoutServer',
      description: 'Checks to see if any players are logged in, and if not, shuts down server',
    });

    this.whitelistPlayer = new lambdaNode.NodejsFunction(this, 'WhitelistPlayer', {
      entry: '../../lambdas/src/index.ts',
      depsLockFilePath: '../../lambdas/package-lock.json',
      handler: 'WhitelistPlayer',
      description: 'Adds a player to the server\'s whitelist (and removes their old account)',
    });
  }
}

