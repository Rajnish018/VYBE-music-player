import express, {
  Request,
  Response,
  NextFunction,
} from 'express';

import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';

/* =========================================================
   ENVIRONMENT
========================================================= */

dotenv.config({
  path: path.join(__dirname, '../.env'),
});

dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

/* =========================================================
   MIDDLEWARE
========================================================= */

import { rateLimiter } from './middleware/rateLimiter';

/* =========================================================
   ROUTES
========================================================= */

import authRoutes from './routes/auth';
import shareRoutes from './routes/youtube';
import trackRoutes from './routes/tracks';
import playlistRoutes from './routes/playlists';
import favoriteRoutes from './routes/favorites';
import historyRoutes from './routes/history';
import adminRoutes from './routes/adminTracks';
import artistRoutes from './routes/artistRoutes';
import publicArtistRoutes from './routes/publicArtist';

/* =========================================================
   DATABASE
========================================================= */

import { prisma } from './config/db';

/* =========================================================
   REDIS
========================================================= */

import redis, {
  connectRedis,
  disconnectRedis,
} from './config/redis';

/* =========================================================
   SERVICES
========================================================= */

import { megaService } from './services/megaService';

import {
  recoverStaleUploadOperations,
} from './services/uploadRecoveryService';

import {
  acquireLock,
  releaseLock,
} from './services/distributedLock';

/* =========================================================
   APP
========================================================= */

const app = express();

const PORT = Number(
  process.env.PORT || 3000,
);

/*
 * Every replica gets its own instance ID.
 *
 * Example:
 *
 * API #1 → api-1
 * API #2 → api-2
 * API #3 → api-3
 */

const INSTANCE_ID =
  process.env.INSTANCE_ID ||
  `api-${process.pid}`;

/* =========================================================
   TRUST PROXY
========================================================= */

if (
  process.env.NODE_ENV === 'production'
) {
  /*
   * Required when Express is behind:
   *
   * Nginx
   * Load balancer
   * Kubernetes ingress
   * Cloud proxy
   */
  app.set('trust proxy', 1);
}

/* =========================================================
   CORS
========================================================= */

const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  process.env.FRONTEND_URL ||
  'http://localhost:5173'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Range',
      'X-Request-ID',
    ],

    exposedHeaders: [
      'Content-Range',
      'Accept-Ranges',
      'Content-Length',
      'X-Request-ID',
    ],
  }),
);

/* =========================================================
   LOGGING
========================================================= */

app.use(
  morgan(
    process.env.NODE_ENV === 'production'
      ? 'combined'
      : 'dev',
  ),
);

/* =========================================================
   BODY PARSER
========================================================= */

app.use(
  express.json({
    limit:
      process.env.JSON_BODY_LIMIT ||
      '1mb',
  }),
);

/* =========================================================
   REQUEST ID
========================================================= */

app.use(
  (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const requestId =
      req.header('X-Request-ID') ||
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;

    res.setHeader(
      'X-Request-ID',
      requestId,
    );

    next();
  },
);

/* =========================================================
   DISTRIBUTED RATE LIMIT
========================================================= */

/*
 * IMPORTANT:
 *
 * This must NOT use an in-memory Map.
 *
 * Redis makes the rate limit shared between:
 *
 * API #1
 * API #2
 * API #3
 * ...
 */

app.use(rateLimiter);

/* =========================================================
   LOCAL UPLOADS
========================================================= */

/*
 * Local uploads are disabled by default.
 *
 * For horizontally scaled production:
 *
 *     API #1 → local filesystem
 *     API #2 → different filesystem
 *
 * is NOT safe.
 *
 * Your permanent media should remain in MEGA/object storage.
 *
 * Enable this only for local development if needed:
 *
 * ENABLE_LOCAL_UPLOADS=true
 */

if (
  process.env.ENABLE_LOCAL_UPLOADS ===
  'true'
) {
  app.use(
    '/uploads',
    express.static(
      path.resolve(
        process.cwd(),
        'uploads',
      ),
    ),
  );
}

/* =========================================================
   LIVENESS HEALTH CHECK
========================================================= */

/*
 * This endpoint only tells the load balancer:
 *
 * "Is this Node process alive?"
 *
 * It does NOT depend on Redis/PostgreSQL.
 */

app.get(
  '/health/live',
  (
    _req: Request,
    res: Response,
  ) => {
    res.status(200).json({
      status: 'ok',
      instance: INSTANCE_ID,
      pid: process.pid,
      timestamp:
        new Date().toISOString(),
    });
  },
);

/* =========================================================
   READINESS HEALTH CHECK
========================================================= */

/*
 * This endpoint tells the load balancer:
 *
 * "Can this instance safely receive traffic?"
 *
 * PostgreSQL + Redis must be available.
 */

app.get(
  '/health/ready',
  async (
    _req: Request,
    res: Response,
  ) => {
    let database = 'down';
    let redisStatus = 'down';

    /* ---------------------------------------------
       PostgreSQL
    --------------------------------------------- */

    try {
      await prisma.$queryRaw`
        SELECT 1
      `;

      database = 'up';
    } catch (error) {
      console.error(
        '[HEALTH] PostgreSQL check failed:',
        error,
      );
    }

    /* ---------------------------------------------
       Redis
    --------------------------------------------- */

    try {
      if (redis.isReady) {
        const result =
          await redis.ping();

        if (result === 'PONG') {
          redisStatus = 'up';
        }
      }
    } catch (error) {
      console.error(
        '[HEALTH] Redis check failed:',
        error,
      );
    }

    const ready =
      database === 'up' &&
      redisStatus === 'up';

    return res
      .status(ready ? 200 : 503)
      .json({
        status: ready
          ? 'ready'
          : 'not_ready',

        instance: INSTANCE_ID,

        services: {
          database,
          redis: redisStatus,
        },

        timestamp:
          new Date().toISOString(),
      });
  },
);

/* =========================================================
   LEGACY HEALTH CHECK
========================================================= */

/*
 * Keeps your existing:
 *
 * GET /health
 *
 * working.
 */

app.get(
  '/health',
  async (
    _req: Request,
    res: Response,
  ) => {
    let database = 'down';
    let redisStatus = 'down';

    try {
      await prisma.$queryRaw`
        SELECT 1
      `;

      database = 'up';
    } catch {
      database = 'down';
    }

    try {
      if (redis.isReady) {
        const result =
          await redis.ping();

        if (result === 'PONG') {
          redisStatus = 'up';
        }
      }
    } catch {
      redisStatus = 'down';
    }

    const healthy =
      database === 'up' &&
      redisStatus === 'up';

    return res
      .status(
        healthy ? 200 : 503,
      )
      .json({
        status: healthy
          ? 'ok'
          : 'degraded',

        instance: INSTANCE_ID,

        services: {
          api: 'up',
          database,
          redis: redisStatus,
        },

        timestamp:
          new Date().toISOString(),
      });
  },
);

// get favicon.ico requests out of the logs
app.get('/favicon.ico', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/favicon.ico'));
});

/* =========================================================
   API ROUTES
========================================================= */

app.use(
  '/api/auth',
  authRoutes,
);

app.use(
  '/api/share',
  shareRoutes,
);

app.use(
  '/api/tracks',
  trackRoutes,
);

app.use(
  '/api/playlists',
  playlistRoutes,
);

app.use(
  '/api/favorites',
  favoriteRoutes,
);

app.use(
  '/api/history',
  historyRoutes,
);

app.use(
  '/api/artists',
  publicArtistRoutes,
);

app.use(
  '/api/admin',
  adminRoutes,
);

app.use(
  '/api/admin/artists',
  artistRoutes,
);

/* =========================================================
   404 HANDLER
========================================================= */

app.use(
  (
    req: Request,
    res: Response,
  ) => {
    res.status(404).json({
      error: 'Route not found',
      path: req.originalUrl,
      requestId:
        res.getHeader(
          'X-Request-ID',
        ),
    });
  },
);

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
  (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    console.error(
      '[ERROR] Unhandled server error:',
      err,
    );

    if (res.headersSent) {
      return;
    }

    const status =
      Number(err?.status) || 500;

    /*
     * Don't expose internal error details
     * in production.
     */

    const message =
      process.env.NODE_ENV ===
      'production'
        ? 'Internal server error'
        : err?.message ||
          'Internal server error';

    res.status(status).json({
      error: message,

      requestId:
        res.getHeader(
          'X-Request-ID',
        ),
    });
  },
);

/* =========================================================
   SERVER
========================================================= */

let server:
  | ReturnType<typeof app.listen>
  | undefined;

/* =========================================================
   UPLOAD RECOVERY
========================================================= */

/*
 * Only ONE API instance should perform
 * stale upload recovery.
 *
 * Redis provides the distributed lock.
 */

async function runUploadRecovery() {
  const lockKey =
    'lock:upload-recovery';

  const lockTtlSeconds =
    Number(
      process.env
        .UPLOAD_RECOVERY_LOCK_TTL_SECONDS ||
        300,
    );

  let lockToken:
    | string
    | null = null;

  try {
    lockToken =
      await acquireLock(
        lockKey,
        lockTtlSeconds,
      );

    /*
     * Another instance already owns
     * the recovery lock.
     */

    if (!lockToken) {
      console.log(
        '[UPLOAD RECOVERY] Another instance is performing recovery.',
      );

      return;
    }

    console.log(
      `[UPLOAD RECOVERY] ${INSTANCE_ID} acquired distributed lock.`,
    );

    const recoverySummary =
      await recoverStaleUploadOperations();

    console.log(
      '[UPLOAD RECOVERY] Startup summary:',
      recoverySummary,
    );
  } catch (error) {
    console.error(
      '[UPLOAD RECOVERY] Recovery failed:',
      error,
    );

    throw error;
  } finally {
    if (lockToken) {
      try {
        await releaseLock(
          lockKey,
          lockToken,
        );

        console.log(
          `[UPLOAD RECOVERY] ${INSTANCE_ID} released distributed lock.`,
        );
      } catch (error) {
        console.error(
          '[UPLOAD RECOVERY] Failed to release distributed lock:',
          error,
        );
      }
    }
  }
}

/* =========================================================
   ENVIRONMENT VALIDATION
========================================================= */

function validateEnvironment() {
  const isProduction =
    process.env.NODE_ENV ===
    'production';

  if (!isProduction) {
    return;
  }

  const required = [
    'JWT_SECRET',
    'DATABASE_URL',
    'REDIS_URL',
    'CORS_ORIGINS',
  ];

  const missing =
    required.filter(
      (key) =>
        !process.env[key]?.trim(),
    );

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(
        ', ',
      )}`,
    );
  }
}

/* =========================================================
   BOOTSTRAP
========================================================= */

async function bootstrap() {
  try {
    console.log('');

    console.log(
      '================================================',
    );

    console.log(
      ' Starting Music Player Backend',
    );

    console.log(
      '================================================',
    );

    console.log(
      `[STARTUP] Instance: ${INSTANCE_ID}`,
    );

    console.log(
      `[STARTUP] PID: ${process.pid}`,
    );

    console.log(
      `[STARTUP] Port: ${PORT}`,
    );

    console.log(
      `[STARTUP] Environment: ${
        process.env.NODE_ENV ||
        'development'
      }`,
    );

    /* ---------------------------------------------
       Validate environment
    --------------------------------------------- */

    validateEnvironment();

    /* ---------------------------------------------
       Redis
    --------------------------------------------- */

    console.log(
      '[STARTUP] Connecting to Redis...',
    );

    await connectRedis();

    console.log(
      '[STARTUP] Redis ready.',
    );

    /* ---------------------------------------------
       PostgreSQL
    --------------------------------------------- */

    console.log(
      '[STARTUP] Connecting to PostgreSQL...',
    );

    await prisma.$connect();

    await prisma.$queryRaw`
      SELECT 1
    `;

    console.log(
      '[STARTUP] PostgreSQL connected successfully.',
    );

    /* ---------------------------------------------
       MEGA
    --------------------------------------------- */

    console.log(
      '[STARTUP] Connecting to MEGA...',
    );

    await megaService.connect();

    console.log(
      '[STARTUP] MEGA storage ready.',
    );

    /* ---------------------------------------------
       Distributed upload recovery
    --------------------------------------------- */

    await runUploadRecovery();

    /* ---------------------------------------------
       Start HTTP server
    --------------------------------------------- */

    server = app.listen(
      PORT,
      '0.0.0.0',
      () => {
        console.log('');

        console.log(
          '================================================',
        );

        console.log(
          ' Music Player Backend',
        );

        console.log(
          ` Instance: ${INSTANCE_ID}`,
        );

        console.log(
          ` PID: ${process.pid}`,
        );

        console.log(
          ` Port: ${PORT}`,
        );

        console.log(
          ` Environment: ${
            process.env.NODE_ENV ||
            'development'
          }`,
        );

        console.log(
          ' Redis: connected',
        );

        console.log(
          ' PostgreSQL: connected',
        );

        console.log(
          ' MEGA: connected',
        );

        console.log(
          ' Rate Limiter: Redis',
        );

        console.log(
          ' Upload Recovery: Distributed Lock',
        );

        console.log(
          '================================================',
        );

        console.log('');
      },
    );

    /* ---------------------------------------------
       Server error
    --------------------------------------------- */

    server.on(
      'error',
      (error) => {
        console.error(
          '[SERVER] HTTP server error:',
          error,
        );

        process.exit(1);
      },
    );
  } catch (error) {
    console.error(
      '[STARTUP] Failed to start server:',
      error,
    );

    /*
     * Close PostgreSQL.
     */

    try {
      await prisma.$disconnect();
    } catch (dbError) {
      console.error(
        '[DATABASE] Shutdown error:',
        dbError,
      );
    }

    /*
     * Close Redis.
     */

    try {
      await disconnectRedis();
    } catch (redisError) {
      console.error(
        '[REDIS] Shutdown error:',
        redisError,
      );
    }

    process.exit(1);
  }
}

/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

let shuttingDown = false;

async function shutdown(
  signal: string,
) {
  /*
   * Prevent multiple SIGTERM/SIGINT
   * handlers from running simultaneously.
   */

  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log('');

  console.log(
    `[SHUTDOWN] ${signal} received.`,
  );

  /*
   * Stop receiving new HTTP requests.
   */

  if (server) {
    await new Promise<void>(
      (resolve) => {
        server!.close(() => {
          console.log(
            '[SHUTDOWN] HTTP server closed.',
          );

          resolve();
        });
      },
    );
  }

  /*
   * PostgreSQL.
   */

  try {
    await prisma.$disconnect();

    console.log(
      '[SHUTDOWN] PostgreSQL disconnected.',
    );
  } catch (error) {
    console.error(
      '[SHUTDOWN] PostgreSQL disconnect failed:',
      error,
    );
  }

  /*
   * Redis.
   */

  try {
    await disconnectRedis();

    console.log(
      '[SHUTDOWN] Redis disconnected.',
    );
  } catch (error) {
    console.error(
      '[SHUTDOWN] Redis disconnect failed:',
      error,
    );
  }

  console.log(
    '[SHUTDOWN] Complete.',
  );

  process.exit(0);
}

/* =========================================================
   PROCESS SIGNALS
========================================================= */

process.on(
  'SIGINT',
  () => {
    void shutdown('SIGINT');
  },
);

process.on(
  'SIGTERM',
  () => {
    void shutdown('SIGTERM');
  },
);

/* =========================================================
   UNHANDLED EXCEPTION
========================================================= */

process.on(
  'uncaughtException',
  (error) => {
    console.error(
      '[PROCESS] Uncaught exception:',
      error,
    );

    void shutdown(
      'uncaughtException',
    );
  },
);

/* =========================================================
   UNHANDLED REJECTION
========================================================= */

process.on(
  'unhandledRejection',
  (reason) => {
    console.error(
      '[PROCESS] Unhandled rejection:',
      reason,
    );

    /*
     * Don't immediately kill the process here.
     *
     * A rejected promise can be handled by
     * the application's error boundaries.
     */
  },
);

/* =========================================================
   START APPLICATION
========================================================= */

void bootstrap();