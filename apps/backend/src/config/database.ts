import { getDb, closeDb, type Db } from '@ev/db';
import { config } from './index';
import { logger } from './logger';

export function connectDatabase(): Db {
  const db = getDb(config.databaseUrl);
  logger.info('PostgreSQL connected via Drizzle');
  return db;
}

export { closeDb };
export type { Db };
