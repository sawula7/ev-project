import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  ocppPort: parseInt(process.env.OCPP_PORT ?? '9000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  mongoUri: required('MONGODB_URI'),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  ocppDefaultAuthKey: process.env.OCPP_DEFAULT_AUTH_KEY ?? '',

  commissionRateBps: parseInt(process.env.COMMISSION_RATE_BPS ?? '1000', 10),

  logLevel: process.env.LOG_LEVEL ?? 'info',
};
