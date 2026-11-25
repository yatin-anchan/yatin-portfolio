
import type { Request, Response } from 'express';

import { env } from '../config/env.js';
import { findAdminLoginCredential } from '../services/admin-auth.service.js';
import { verifyPassword } from '../services/password.service.js';
import { recoverAdminAccess } from '../services/admin-recovery-auth.service.js';

import {
  createAdminSession,
  revokeAdminSession,
} from '../services/session.service.js';

import {
  requestPasswordReset,
  completePasswordReset,
} from '../services/password-reset.service.js';

import { ADMIN_SESSION_COOKIE } from '../middleware/admin-auth.js';

interface LoginInput {
  email: string;
  password: string;
}

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api',
};

function unauthorized(res: Response): void {
  res.status(401).json({
    error: {
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect.',
    },
  });
}

export async function login(
  req: Request,
  res: Response,
): Promise<void> {
  const input = res.locals.validated?.body as LoginInput;

  const admin = await findAdminLoginCredential(input.email);

  if (!admin) {
    unauthorized(res);
    return;
  }

  const passwordIsValid = await verifyPassword(
    admin.passwordHash,
    input.password,
  );

  if (!passwordIsValid) {
    unauthorized(res);
    return;
  }

  const { token, session } = await createAdminSession(
    admin.id,
    {
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    },
  );

  if (!session) {
    throw new Error('Failed to create admin session.');
  }

  res.cookie(ADMIN_SESSION_COOKIE, token, {
    ...cookieOptions,
    maxAge: SESSION_DURATION_MS,
  });

  res.status(200).json({
    message: 'Login successful.',
    data: {
      admin: {
        id: admin.adminUserId,
        email: admin.email,
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt,
      },
    },
  });
}

export async function logout(
  req: Request,
  res: Response,
): Promise<void> {
  const token = req.cookies?.[ADMIN_SESSION_COOKIE];

  if (typeof token === 'string' && token.length > 0) {
    await revokeAdminSession(token);
  }

  res.clearCookie(ADMIN_SESSION_COOKIE, cookieOptions);

  res.status(200).json({
    message: 'Logout successful.',
  });
}

export function getCurrentAdmin(
  _req: Request,
  res: Response,
): void {
  const admin = res.locals.admin as {
    id: string;
    emailId: string;
    email: string;
    sessionId: string;
  };

  res.status(200).json({
    data: {
      id: admin.id,
      email: admin.email,
      sessionId: admin.sessionId,
    },
  });
}

export async function forgotPassword(
  req: Request,
  res: Response,
): Promise<void> {
  const input = res.locals.validated?.body as {
    email: string;
  };

  await requestPasswordReset(
    input.email,
    req.ip ?? null,
  );

  res.status(202).json({
    message:
      'If an eligible account exists, password reset instructions will be sent.',
  });
}

export async function resetPassword(
  _req: Request,
  res: Response,
): Promise<void> {
  const input = res.locals.validated?.body as {
    token: string;
    newPassword: string;
  };

  const success = await completePasswordReset(
    input.token,
    input.newPassword,
  );

  if (!success) {
    res.status(400).json({
      error: {
        code: 'INVALID_OR_EXPIRED_RESET_TOKEN',
        message: 'The password reset link is invalid or has expired.',
      },
    });
    return;
  }

  res.status(200).json({
    message: 'Password reset successfully. Please log in again.',
  });
}



export async function recoverWithRecoveryCode(
  req: Request,
  res: Response,
): Promise<void> {
  const input = res.locals.validated?.body as {
    email: string;
    recoveryCode: string;
  };

  const result = await recoverAdminAccess({
    email: input.email,
    code: input.recoveryCode,
    metadata: {
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    },
  });

  if (!result) {
    res.status(401).json({
      error: {
        code: 'INVALID_RECOVERY_CREDENTIALS',
        message: 'The email or recovery code is invalid.',
      },
    });
    return;
  }

  res.cookie(ADMIN_SESSION_COOKIE, result.token, {
    ...cookieOptions,
    maxAge: SESSION_DURATION_MS,
  });

  res.status(200).json({
    success: true,
    message: 'Account recovery successful.',
    data: {
      admin: result.admin,
      session: {
        id: result.session.id,
        expiresAt: result.session.expiresAt,
      },
    },
  });
}
