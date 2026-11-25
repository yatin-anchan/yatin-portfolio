
import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import {
  regenerateRecoveryCodesForAdmin,
  countUnusedRecoveryCodes,
} from '../services/recovery-codes.service.js';
import { notifyAdminSecurityEvent } from '../services/admin-security-settings.service.js';

interface AuthenticatedAdmin {
  id: string;
  emailId: string;
  email: string;
}

interface RegenerateInput {
  currentPassword: string;
  verificationCode?: string;
}

export async function getRecoveryCodeStatus(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = res.locals.admin as AuthenticatedAdmin;

    const remaining = await countUnusedRecoveryCodes(admin.id);

    res.status(200).json({
      success: true,
      data: {
        remaining,
        total: 10,
        needsRegeneration: remaining === 0,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function regenerateRecoveryCodes(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = res.locals.admin as AuthenticatedAdmin;
    const input = res.locals.validated?.body as RegenerateInput;

    const codes = await regenerateRecoveryCodesForAdmin(
      admin.id,
      admin.emailId,
      input.currentPassword,
      input.verificationCode,
      {
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
    );

    if (!codes) {
      res.status(401).json({
        error: {
          code: 'CURRENT_PASSWORD_INVALID',
          message: 'The current password, login email, or required trusted verification is invalid.',
        },
      });
      return;
    }

    void notifyAdminSecurityEvent(
      admin.id,
      admin.email,
      'Administrator recovery codes were regenerated.',
    );

    res.status(200).json({
      success: true,
      message: 'Recovery codes generated. Store them securely; they will not be shown again.',
      data: {
        codes,
        total: codes.length,
      },
    });
  } catch (error) {
    next(error);
  }
}
