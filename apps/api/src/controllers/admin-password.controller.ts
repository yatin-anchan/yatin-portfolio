
import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import { ApiError } from '../lib/errors/api-error.js';
import {
  changeAdminPassword,
} from '../services/admin-password.service.js';
import { notifyAdminSecurityEvent } from '../services/admin-security-settings.service.js';

interface AuthenticatedAdmin {
  id: string;
  emailId: string;
  email: string;
  sessionId: string;
}

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  verificationCode?: string;
}

export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = res.locals.admin as AuthenticatedAdmin;
    const input = res.locals.validated?.body as ChangePasswordInput;

    if (!admin?.id || !admin.emailId || !admin.sessionId) {
      throw new ApiError(
        401,
        'UNAUTHENTICATED',
        'Authentication is required.',
      );
    }

    if (input.currentPassword === input.newPassword) {
      throw new ApiError(
        400,
        'PASSWORD_UNCHANGED',
        'Your new password must be different from your current password.',
      );
    }

    const changed = await changeAdminPassword({
      adminId: admin.id,
      emailId: admin.emailId,
      currentSessionId: admin.sessionId,
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      verificationCode: input.verificationCode,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    if (!changed) {
      throw new ApiError(
        400,
        'CURRENT_PASSWORD_INVALID',
        'The current password, login email, or required trusted verification is invalid.',
      );
    }

    void notifyAdminSecurityEvent(
      admin.id,
      admin.email,
      'The password for your administrator account was changed.',
    );

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. Other active sessions have been revoked.',
    });
  } catch (error) {
    next(error);
  }
}
