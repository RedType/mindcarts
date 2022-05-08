import { CdkCustomResourceEvent } from 'aws-lambda';
import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
  BatchWriteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { expectEnv } from './util';
import { PARTITION_KEY, SORT_KEY } from './configSchema';

const BATCH_SZ = 25;

const DDB_CLIENT = new DynamoDBClient({});

const onUpdate = async (event: CdkCustomResourceEvent) => {
  const { serverId } = event.ResourceProperties;
  console.log(`Updating info record for ${serverId}`);

  await DDB_CLIENT.send(new UpdateItemCommand({
    TableName: expectEnv('CONFIG_TABLE_NAME'),
    Key: event.ResourceProperties.Key,
    UpdateExpression: 'SET isLive=false',
  }));

  console.log(`Hello ${serverId}`);
};

const onDelete = async (event: CdkCustomResourceEvent) => {
  const { serverId } = event.ResourceProperties;
  console.log(`Retrieving all records for ${serverId}`);

  let allItems = [];

  // get all the items to delete
  let ExclusiveStartKey: any = undefined;
  do {
    const { LastEvaluatedKey, Items } = await DDB_CLIENT.send(new ScanCommand({
      TableName: expectEnv('CONFIG_TABLE_NAME'),
      ProjectionExpression: `${PARTITION_KEY} = ${serverId}`,
      ExclusiveStartKey,
    }));
    console.log(`  Got ${Items.length} records`);

    allItems.concat(Items.map(item => unmarshall(item)));
    ExclusiveStartKey = LastEvaluatedKey;
  } while (ExclusiveStartKey);

  // batch delete all the items
  console.log(`Deleting ${allItems.length} records`);

  while (allItems.length > 0) {
    let thisBatch: unknown[];

    if (allItems.length > BATCH_SZ) {
      thisBatch = allItems.slice(undefined, BATCH_SZ);
      allItems = allItems.slice(BATCH_SZ, undefined);
    } else {
      thisBatch = allItems;
    }

    await DDB_CLIENT.send(new BatchWriteItemCommand({
      RequestItems: {
        [expectEnv('CONFIG_TABLE_NAME')]: thisBatch.map(item => ({
          DeleteRequest: {
            Key: {
              [PARTITION_KEY]: item[PARTITION_KEY],
              [SORT_KEY]: item[SORT_KEY],
            },
          },
        })),
      },
    }));

    console.log(`  Deleted ${thisBatch.length} records`);
  }

  console.log(`Goodbye ${serverId}`);
};

export default (event: CdkCustomResourceEvent) => {
  switch(event.RequestType) {
    case 'Create':
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
    default:
      // just in case DefinitelyTyped is wrong
      throw new Error(`Unrecognized RequestType '${(event as any).RequestType}'`);
  }
};

