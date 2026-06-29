import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../../config/redis';

// Simple sliding-window rate limiter backed by Redis.
// Uses a counter key per IP per window; increments atomically.
export function rateLimit(options: { windowMs: number; max: number; keyPrefix?: string }) {
  const { windowMs, max, keyPrefix = 'rl' } = options;
  const windowSec = Math.ceil(windowMs / 1000);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = req.ip ?? 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const redis = getRedis();

    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowSec);
      }
      if (current > max) {
        res.status(429).json({ success: false, error: 'Too many requests — slow down' });
        return;
      }
    } catch {
      // If Redis is unavailable, fail open rather than block legitimate traffic
    }
    next();
  };
}

// Prebuilt limiters
export const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'rl:auth' });
export const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, keyPrefix: 'rl:api' });
