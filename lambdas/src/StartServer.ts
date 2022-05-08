import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';
import { z } from 'zod';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as util from 'util';

import { SERVER_INFO_KEY } from '../../iac/lib/MinecraftStack';
import { expectEnv } from './util';

const DDB_CLIENT = new DynamoDBClient({});
const ECS_CLIENT = new ECSClient({});

export const StartServerBody = z.object({
  serverId: z.string(),
});
export type StartServerBody = z.infer<typeof StartServerBody>;

export default async (event: APIGatewayProxyEvent) => {
  const { serverId } = StartServerBody.parse(JSON.parse(event.body));

  const { Item } = await DDB_CLIENT.send(new GetItemCommand({
    TableName: expectEnv('CONFIG_TABLE_NAME'),
    Key: {
      server: { S: serverId },
      config: { S: SERVER_INFO_KEY },
    },
  }));

  const 

  const { failures, tasks } = await ECS_CLIENT.send(new RunTaskCommand({
    cluster: expectEnv('CLUSTER_ARN'),
    count: 1,
    launchType: 'FARGATE',
    taskDefinition: expectEnv('TASK_DEFINITION_ARN'),
  }));

  if (failures.length > 0) {
    console.error('Failed to run server');
    console.error(util.inspect(failures));
    throw new Error(`Failed to run server ${serverId}`);
  }

  await DDB_CLIENT.send(new UpdateItemCommand({
    TableName: expectEnv('CONFIG_TABLE_NAME'),
    Key: {
      server: { S: serverId },
    },
  }));
};

