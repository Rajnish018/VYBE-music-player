import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { hashPassword, comparePassword, generateToken } from '../utils/auth';
import { Prisma, Role } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { verifyToken } from '../utils/auth';

const router = Router();

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, role: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'User session is no longer valid' });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error('Fetch current user error:', error);
    return res.status(500).json({ error: 'Unable to verify the current session' });
  }
});

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || password.length < 6) {
      return res.status(422).json({ error: 'A valid email and password of at least 6 characters are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || password.length > 128) {
      return res.status(422).json({ error: 'Enter a valid email and password.' });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (transaction) => {
      const userCount = await transaction.user.count();
      return transaction.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: userCount === 0 ? Role.ADMIN : Role.USER
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    // Generate JWT token
    const token = generateToken({ userId: user.id, role: user.role });

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Email is already registered' });
    }
    return res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || password.length < 6) {
      return res.status(422).json({ error: 'A valid email and password of at least 6 characters are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Compare passwords
    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = generateToken({ userId: user.id, role: user.role });

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error during login' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    // In stateless JWT, we can refresh a valid token by signing a new one
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing or invalid' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token for refresh' });
    }

    // Check if user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    const newToken = generateToken({ userId: user.id, role: user.role });

    return res.status(200).json({
      token: newToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({ error: 'Internal server error during token refresh' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response) => {
  // Since JWT is stateless, logout is handled by client discarding the token.
  // We return a simple successful message.
  return res.status(200).json({ message: 'Logged out successfully' });
});

export default router;
