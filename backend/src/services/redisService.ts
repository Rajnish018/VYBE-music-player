import redis from '../config/redis';

class RedisService {
  private disabled =
    process.env.REDIS_DISABLED === 'true';

  private isAvailable(): boolean {
    return (
      !this.disabled &&
      Boolean(
        process.env.UPSTASH_REDIS_REST_URL &&
        process.env.UPSTASH_REDIS_REST_TOKEN,
      )
    );
  }

  async getJson<T>(
    key: string,
  ): Promise<T | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const value =
        await redis.get<T>(key);

      if (
        value === null ||
        value === undefined
      ) {
        return null;
      }

      // Upstash may return a parsed object
      // or a string depending on the stored value.
      if (typeof value === 'string') {
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as T;
        }
      }

      return value;
    } catch (error: any) {
      console.warn(
        `Redis get failed for ${key}:`,
        error?.message || error,
      );

      return null;
    }
  }

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      await redis.set(
        key,
        JSON.stringify(value),
        {
          ex: ttlSeconds,
        },
      );
    } catch (error: any) {
      console.warn(
        `Redis set failed for ${key}:`,
        error?.message || error,
      );
    }
  }

  async del(
    ...keys: string[]
  ): Promise<void> {
    const safeKeys =
      keys.filter(Boolean);

    if (
      safeKeys.length === 0 ||
      !this.isAvailable()
    ) {
      return;
    }

    try {
      await redis.del(...safeKeys);
    } catch (error: any) {
      console.warn(
        'Redis delete failed:',
        error?.message || error,
      );
    }
  }

  async delByPattern(
    pattern: string,
  ): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      let cursor = 0;

      do {
        const result =
          await redis.scan(cursor, {
            match: pattern,
            count: 100,
          });

        cursor = Number(result[0]);

        const keys = result[1];

        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== 0);
    } catch (error: any) {
      console.warn(
        `Redis pattern delete failed for ${pattern}:`,
        error?.message || error,
      );
    }
  }
}

export const redisService =
  new RedisService();

export const redisKeys = {
  tracksAll: 'tracks:all:v1',

  favoritesForUser(
    userId: string,
  ) {
    return `favorites:user:${userId}:v1`;
  },
};

export const redisTtl = {
  tracks: 60,
  favorites: 60,
};

export async function invalidateTrackCache(
  _trackId?: string,
) {
  await redisService.del(
    redisKeys.tracksAll,
  );
}

export async function invalidateFavoritesCache(
  userId: string,
) {
  await redisService.del(
    redisKeys.favoritesForUser(userId),
  );
}

export async function invalidateAllFavoritesCaches() {
  await redisService.delByPattern(
    'favorites:user:*:v1',
  );
}