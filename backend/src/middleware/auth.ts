import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import { Role } from '@prisma/client';
import { prisma } from '../config/db';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: Role;
  };
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  let token = '';
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authorization token missing or invalid' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Token is invalid or expired' });
  }

  req.user = {
    id: payload.userId,
    role: payload.role as Role,
  };

  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { role: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'User session is no longer valid' });
    }

    req.user.role = user.role;
    if (user.role !== Role.ADMIN) {
      return res.status(403).json({ error: 'Access denied: Admin privileges required' });
    }

    next();
  } catch (error) {
    next(error);
  }
}
