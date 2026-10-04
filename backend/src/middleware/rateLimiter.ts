import {
  Request,
  Response,
  NextFunction,
} from 'express';

import redis from '../config/redis';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 120;

export async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const ip =
      req.ip ||
      req.socket.remoteAddress ||
      'unknown';

    const key = `ratelimit:${ip}`;

    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(
        key,
        WINDOW_SECONDS,
      );
    }

    const ttl = await redis.ttl(key);

    res.setHeader(
      'X-RateLimit-Limit',
      MAX_REQUESTS,
    );

    res.setHeader(
      'X-RateLimit-Remaining',
      Math.max(
        0,
        MAX_REQUESTS - count,
      ),
    );

    res.setHeader(
      'X-RateLimit-Reset',
      ttl,
    );

    if (count > MAX_REQUESTS) {
      return res.status(429).json({
        error:
          'Too many requests. Please try again later.',
        retryAfter: ttl,
      });
    }

    next();
  } catch (error) {
    console.error(
      '[RATE LIMIT] Redis error:',
      error,
    );

    /*
     * Fail-open for availability.
     *
     * If Redis temporarily fails, don't
     * take the entire music API offline.
     */
    next();
  }
}