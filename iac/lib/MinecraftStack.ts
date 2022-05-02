import { Construct } from 'constructs';

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as kms from 'aws-cdk-lib/aws-kms';

const MINECRAFT_PORT = 25565;
const NFS_PORT = 2049;
const RCON_PORT = 25575;
const SSH_PORT = 22;

export interface MinecraftStackProps extends cdk.StackProps {
  readonly cluster: ecs.ICluster;
  readonly containerEnvironment?: Record<string, string>;
  readonly containerImagePath: string;
  readonly vpc: ec2.IVpc;
}

export default class MinecraftStack extends cdk.Stack {
  private readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: MinecraftStackProps) {
    super(scope, id, props);

    const { cluster, vpc } = props;

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

    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 0,
    });

    /////////////////////////
    // Networking Internal //
    /////////////////////////

    // Internal NFS
    filesystem.connections.allowFrom(service, ec2.Port.tcp(NFS_PORT));
    service.connections.allowFrom(filesystem, ec2.Port.tcp(NFS_PORT));

    /////////////////////////
    // Networking External //
    /////////////////////////

    // Minecraft
    service.connections.allowFrom(ec2.Peer.anyIpv4(), ec2.Port.tcp(MINECRAFT_PORT));
    service.connections.allowFrom(ec2.Peer.anyIpv6(), ec2.Port.tcp(MINECRAFT_PORT));

    // SSH
    service.connections.allowFrom(ec2.Peer.anyIpv4(), ec2.Port.tcp(SSH_PORT));
    service.connections.allowFrom(ec2.Peer.anyIpv6(), ec2.Port.tcp(SSH_PORT));

    // Ping
    service.connections.allowFrom(ec2.Peer.anyIpv4(), ec2.Port.icmpPing());
    service.connections.allowFrom(ec2.Peer.anyIpv6(), ec2.Port.icmpPing());
  }

  public registerRconPeers(peers: ec2.IConnectable[]) {
    for (const peer of peers) {
      this.service.connections.allowFrom(peer, ec2.Port.tcp(RCON_PORT));
    }
  }
}

