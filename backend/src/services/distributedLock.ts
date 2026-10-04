import crypto from 'crypto';
import redis from '../config/redis';

export async function acquireLock(
  key: string,
  ttlSeconds: number,
): Promise<string | null> {
  const token = crypto.randomUUID();

  const result = await redis.set(key, token, {
    nx: true,
    ex: ttlSeconds,
  });

  return result === 'OK' ? token : null;
}

export async function releaseLock(
  key: string,
  token: string,
): Promise<boolean> {
  const lua = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;

  const result = await redis.eval(
    lua,
    [key],
    [token],
  );

  return result === 1;
}