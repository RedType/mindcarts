import { Construct } from 'constructs';
import { xor } from './util';
import ConfigRecordProvider from './util/ConfigRecordProvider';

import * as cdk from 'aws-cdk-lib';
import * as dynamo from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as route53 from 'aws-cdk-lib/aws-route53';

const MINECRAFT_PORT = 25565;
const NFS_PORT = 2049;
const RCON_PORT = 25575;
const SSH_PORT = 22;

export interface MinecraftStackProps extends cdk.StackProps {
  readonly cluster: ecs.ICluster;
  readonly configRecordProvider: ConfigRecordProvider;
  readonly configTable: dynamo.ITable;
  readonly containerEnvironment?: Record<string, string>;
  readonly containerImagePath: string;
  readonly serverId: string;
  readonly subdomain?: string;
  readonly vpc: ec2.IVpc;
  readonly zoneId?: string;
}

export default class MinecraftStack extends cdk.Stack {
  public readonly rconDnsName: string;
  public readonly serverId: string;
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: MinecraftStackProps) {
    super(scope, id, props);

    if(xor(props.subdomain, props.zoneId)) {
      throw new Error('If one of subdomain and zoneId are defined, then both must be');
    }

    const { cluster, vpc } = props;
    this.serverId = props.serverId;

    ///////////////////////
    // Persistent Volume //
    ///////////////////////

    const encryptionKey = new kms.Key(this, 'EncryptionKey');

    const filesystem = new efs.FileSystem(this, 'ServerFilesystem', {
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_7_DAYS,
      outOfInfrequentAccessPolicy: efs.OutOfInfrequentAccessPolicy.AFTER_1_ACCESS,

      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },

      encrypted: true,
      kmsKey: encryptionKey,
    });

    const volume = {
      name: 'minecraft-system-volume',
      efsVolumeConfiguration: {
        fileSystemId: filesystem.fileSystemId,
        transitEncryption: 'ENABLED',
      },
    };

    /////////////////
    // Server Task //
    /////////////////

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: 1024,
      memoryLimitMiB: 6144, // 6 GiB
      volumes: [volume],
    });

    const container = taskDefinition.addContainer('MinecraftServer', {
      image: ecs.ContainerImage.fromAsset(props.containerImagePath),
      portMappings: [
        { hostPort: MINECRAFT_PORT, containerPort: MINECRAFT_PORT }, // minecraft server port
        { hostPort: SSH_PORT, containerPort: SSH_PORT }, // ssh
      ],
      environment: props.containerEnvironment,
    });

    container.addMountPoints({
      containerPath: '/srv/minecraft',
      sourceVolume: volume.name,
      readOnly: false,
    });

    const service = this.service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 0,
    });

    /////////////////////////
    // Networking Internal //
    /////////////////////////

    // Internal NFS
    filesystem.connections.allowFrom(service, ec2.Port.tcp(NFS_PORT));
    filesystem.connections.allowTo(service, ec2.Port.tcp(NFS_PORT));
    service.connections.allowFrom(filesystem, ec2.Port.tcp(NFS_PORT));
    service.connections.allowTo(filesystem, ec2.Port.tcp(NFS_PORT));

    const ilb = new elb.NetworkLoadBalancer(this, 'InternalLB', { vpc, internetFacing: false });

    ilb.addListener('rcon', { port: RCON_PORT })
      .addTargets('rcon', {
        targets: [service],
        port: RCON_PORT,
        healthCheck: { enabled: false },
      })
    ;

    this.rconDnsName = ilb.loadBalancerDnsName;

    /////////////////////////
    // Networking External //
    /////////////////////////

    const lb = new elb.NetworkLoadBalancer(this, 'LB', { vpc, internetFacing: true });

    lb.addListener('minecraft', { port: MINECRAFT_PORT })
      .addTargets('minecraft', {
        targets: [service],
        port: MINECRAFT_PORT,
        protocol: elb.Protocol.TCP,
        preserveClientIp: true, // for server ip bans and such
        healthCheck: { enabled: false },
      })
    ;

    lb.addListener('ssh', { port: SSH_PORT })
      .addTargets('ssh', {
        targets: [service],
        port: SSH_PORT,
        protocol: elb.Protocol.TCP,
        healthCheck: { enabled: false },
      })
    ;

    /////////
    // DNS //
    /////////

    if (props.zoneId) {
      const zone = route53.HostedZone.fromHostedZoneId(this, 'Zone', props.zoneId);

      new route53.CnameRecord(this, 'ServerRecord', {
        zone,
        recordName: props.subdomain,
        domainName: lb.loadBalancerDnsName,
      });
    }

    ///////////////////
    // Config Record //
    ///////////////////

    props.configRecordProvider.getResource(this.node.path + '/ConfigRecord', {
      serverId: props.serverId,
    });
  }
}

