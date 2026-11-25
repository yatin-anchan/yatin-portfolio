
import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import {
  listAdminSessions,
  revokeAdminSessionById,
  revokeOtherAdminSessions,
} from '../services/admin-sessions.service.js';

interface AuthenticatedAdmin {
  id: string;
  emailId: string;
  email: string;
  sessionId: string;
}

function getRequestMetadata(req: Request) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

export async function getSessions(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = res.locals.admin as AuthenticatedAdmin;

    const sessions = await listAdminSessions(
      admin.id,
      admin.sessionId,
    );

    res.status(200).json({
      success: true,
      data: {
        sessions,
        total: sessions.length,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function revokeSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = res.locals.admin as AuthenticatedAdmin;
    const { id } = res.locals.validated.params as { id: string };

    if (id === admin.sessionId) {
      res.status(400).json({
        error: {
          code: 'CANNOT_REVOKE_CURRENT_SESSION',
          message: 'Use logout to terminate your current session.',
        },
      });
      return;
    }

    const revoked = await revokeAdminSessionById(
      admin.id,
      id,
      admin.sessionId,
      getRequestMetadata(req),
    );

    if (!revoked) {
      res.status(404).json({
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'The session was not found or is no longer active.',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Session revoked successfully.',
    });
  } catch (error) {
    next(error);
  }
}

export async function revokeOtherSessions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = res.locals.admin as AuthenticatedAdmin;

    const revokedCount = await revokeOtherAdminSessions(
      admin.id,
      admin.sessionId,
      getRequestMetadata(req),
    );

    res.status(200).json({
      success: true,
      message: 'Other active sessions have been revoked.',
      data: {
        revokedCount,
      },
    });
  } catch (error) {
    next(error);
  }
}
