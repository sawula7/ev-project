import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

// RDS's auto-generated Secrets Manager secret only contains username/password
// (not a full connection string), so in AWS we assemble DATABASE_URL from
// discrete PG* parts. Local dev (docker-compose) sets DATABASE_URL directly.
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const host = required('PGHOST');
  const port = process.env.PGPORT ?? '5432';
  const user = required('PGUSER');
  const password = required('PGPASSWORD');
  const database = required('PGDATABASE');
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  ocppPort: parseInt(process.env.OCPP_PORT ?? '9000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  databaseUrl: resolveDatabaseUrl(),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  ocppDefaultAuthKey: process.env.OCPP_DEFAULT_AUTH_KEY ?? '',

  commissionRateBps: parseInt(process.env.COMMISSION_RATE_BPS ?? '1000', 10),

  logLevel: process.env.LOG_LEVEL ?? 'info',
};
