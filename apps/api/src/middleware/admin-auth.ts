import type { RequestHandler } from 'express';

import { env } from '../config/env.js';
import { findActiveAdminSession } from '../services/session.service.js';

export const ADMIN_SESSION_COOKIE = 'admin_session';

export const requireAdmin: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const token = req.cookies?.[ADMIN_SESSION_COOKIE];

    if (typeof token !== 'string' || !token) {
      res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication is required.',
        },
      });
      return;
    }

    const session = await findActiveAdminSession(token);

    if (!session) {
      res.clearCookie(ADMIN_SESSION_COOKIE, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api',
      });

      res.status(401).json({
        error: {
          code: 'INVALID_SESSION',
          message: 'Your session is invalid or has expired.',
        },
      });
      return;
    }

    res.locals.admin = {
      id: session.adminUserId,
      emailId: session.adminEmailId,
      email: session.email,
      sessionId: session.sessionId,
    };

    next();
  } catch (error) {
    next(error);
  }
};