import Redis from 'ioredis';
import { config } from './index';
import { logger } from './logger';

let redis: Redis;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
    redis.on('error', (err) => logger.error({ err }, 'Redis error'));
    redis.on('connect', () => logger.info('Redis connected'));
  }
  return redis;
}
