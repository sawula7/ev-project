import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export function getDb(databaseUrl: string) {
  if (!_db) {
    _client = postgres(databaseUrl, { max: 10 });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

export async function closeDb() {
  if (_client) {
    await _client.end();
    _client = null;
    _db = null;
  }
}

export type Db = ReturnType<typeof getDb>;
