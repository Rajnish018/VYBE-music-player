import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });
// Fallback load from workspace root if not found in backend folder
dotenv.config({ path: path.join(__dirname, '../../.env') });

import authRoutes from './routes/auth';
import shareRoutes from './routes/youtube';
import trackRoutes from './routes/tracks';
import playlistRoutes from './routes/playlists';
import favoriteRoutes from './routes/favorites';
import historyRoutes from './routes/history';
import adminRoutes from './routes/adminTracks';
import { prisma } from './config/db';
import { megaService } from './services/megaService';

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  process.env.FRONTEND_URL ||
  'http://localhost:5173'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Enable CORS only for configured frontend origins.
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'X-Request-ID'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'X-Request-ID'],
}));

app.use(morgan('dev'));
app.use(express.json());

// Basic memory rate limiter for production security
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 120; // 120 requests per minute

app.use((req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const limit = rateLimits.get(ip);

  if (!limit) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return next();
  }

  if (now > limit.resetAt) {
    limit.count = 1;
    limit.resetAt = now + RATE_LIMIT_WINDOW;
    return next();
  }

  limit.count++;
  if (limit.count > MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/tracks', trackRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/admin', adminRoutes);

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled server error:', err);
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
});

// Boot server
async function bootstrap() {
  try {
    if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET?.trim()) {
      throw new Error('JWT_SECRET must be configured in production.');
    }
    // 1. Verify DB connection
    console.log('Testing database connectivity...');
    await prisma.$connect();
    console.log('Connected to PostgreSQL database successfully!');

    // 2. Initialize MEGA Storage connection in the background
    megaService.connect().then(() => {
      console.log('MEGA storage ready for media streaming.');
    }).catch(err => {
      console.error('CRITICAL: Failed to connect to MEGA during initialization. App will continue running but storage endpoints will fail.', err.message);
    });

    // 3. Start listener
    app.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(` Music Player Backend Server listening on port ${PORT}`);
      console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`===============================================`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
