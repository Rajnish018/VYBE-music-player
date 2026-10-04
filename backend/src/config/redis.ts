import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function connectRedis() {
  try {
    const pong = await redis.ping();

    console.log(`[Redis] Connected: ${pong}`);
  } catch (error) {
    console.error('[Redis] Connection error:', error);
    throw error;
  }
}

export async function disconnectRedis() {
  // Upstash REST is request-based; there is no persistent
  // socket connection that needs to be closed.
  console.log('[Redis] Disconnected');
}

export default redis;