import {
  createClient,
  RedisClientType,
} from 'redis';


const REDIS_URL = process.env.REDIS_URL;

class RedisService {
  private client: RedisClientType | null =
    null;

  private connecting:
    | Promise<RedisClientType | null>
    | null = null;

  private get url() {
    return (
      process.env.REDIS_URL 
    );
  }

  private async getClient() {
    if (
      process.env.REDIS_DISABLED === 'true'
    ) {
      return null;
    }

    if (this.client?.isOpen) {
      return this.client;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = (async () => {
      try {
        const client = createClient({
          url: this.url,
        }) as RedisClientType;

        client.on(
          'error',
          (error) => {
            console.warn(
              'Redis error:',
              error?.message || error,
            );
          },
        );

        await client.connect();

        this.client = client;

        return client;
      } catch (error: any) {
        console.warn(
          'Redis unavailable; falling back to PostgreSQL:',
          error?.message || error,
        );

        this.client = null;

        return null;
      } finally {
        this.connecting = null;
      }
    })();

    return this.connecting;
  }

  async getJson<T>(key: string) {
    try {
      const client =
        await this.getClient();

      if (!client) {
        return null;
      }

      const value =
        await client.get(key);

      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
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
  ) {
    try {
      const client =
        await this.getClient();

      if (!client) {
        return;
      }

      await client.set(
        key,
        JSON.stringify(value),
        {
          EX: ttlSeconds,
        },
      );
    } catch (error: any) {
      console.warn(
        `Redis set failed for ${key}:`,
        error?.message || error,
      );
    }
  }

  async del(...keys: string[]) {
    const safeKeys =
      keys.filter(Boolean);

    if (safeKeys.length === 0) {
      return;
    }

    try {
      const client =
        await this.getClient();

      if (!client) {
        return;
      }

      await client.del(safeKeys);
    } catch (error: any) {
      console.warn(
        'Redis delete failed:',
        error?.message || error,
      );
    }
  }

  async delByPattern(pattern: string) {
    try {
      const client =
        await this.getClient();

      if (!client) {
        return;
      }

      const keys: string[] = [];

      for await (const key of client.scanIterator({
        MATCH: pattern,
        COUNT: 100,
      })) {
        keys.push(String(key));
      }

      if (keys.length > 0) {
        await client.del(keys);
      }
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

  favoritesForUser(userId: string) {
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
