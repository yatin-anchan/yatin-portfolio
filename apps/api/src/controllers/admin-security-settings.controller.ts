
import type {
  Request,
  Response,
  NextFunction,
} from 'express';
import { ApiError } from '../lib/errors/api-error.js';

import {
  getAdminSecuritySettings,
  updateAdminSecuritySettings,
  getTrustedPrimaryAdminEmail,
  notifyAdminSecurityEvent,
  type AdminSecurityPreferencesUpdate,
} from '../services/admin-security-settings.service.js';
import { reauthenticateAdmin } from '../services/admin-reauth.service.js';

interface AuthenticatedAdmin {
  id: string;
  emailId: string;
  email: string;
}

export async function getSecuritySettings(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = res.locals.admin as AuthenticatedAdmin;

    const settings = await getAdminSecuritySettings(admin.id);

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateSecuritySettings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = res.locals.admin as AuthenticatedAdmin;

    const input = res.locals.validated.body as
      AdminSecurityPreferencesUpdate & {
        currentPassword: string;
        verificationCode: string;
      };

    const passwordHash = await reauthenticateAdmin(
      admin.id,
      admin.emailId,
      input.currentPassword,
    );

    if (!passwordHash) {
      throw new ApiError(
        401,
        'REAUTHENTICATION_FAILED',
        'The current password is incorrect or the authenticated login email is unavailable.',
      );
    }

    const trustedEmail = await getTrustedPrimaryAdminEmail(admin.id);
    const {
      currentPassword: _currentPassword,
      verificationCode,
      ...updates
    } = input;

    const settings = await updateAdminSecuritySettings(
      admin.id,
      admin.emailId,
      passwordHash,
      trustedEmail.id,
      updates,
      verificationCode,
      req.ip ?? null,
      req.get('user-agent') ?? null,
    );

    void notifyAdminSecurityEvent(
      admin.id,
      admin.email,
      'Security preferences for your administrator account were updated.',
    );

    res.status(200).json({
      success: true,
      message: 'Security preferences updated successfully.',
      data: settings,
    });
  } catch (error) {
    next(error);
  }
}
