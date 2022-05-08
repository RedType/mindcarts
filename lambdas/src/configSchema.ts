import { z } from 'zod';

export const PARTITION_KEY = 'serverId';
export const SORT_KEY = 'configType';

export const SERVER_INFO_SK = 'info';

export const ServerInfoRecord = z.object({
  [PARTITION_KEY]: z.string(),
  [SORT_KEY]: z.enum([SERVER_INFO_SK]),
  taskArn: z.string().optional(),
  isLive: z.boolean(),
});
export type ServerInfoRecord = z.infer<typeof ServerInfoRecord>;
