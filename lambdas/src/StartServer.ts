import { EC2Client, StartInstancesCommand } from '@aws-sdk/client-ec2';
import { expectEnv } from './util';

const CLIENT = new EC2Client({});

export default () => CLIENT.send(new StartInstancesCommand({
  InstanceIds: [expectEnv('EC2_INSTANCE_ID')],
}));

