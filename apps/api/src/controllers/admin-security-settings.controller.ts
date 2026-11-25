
import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import {
  getAdminSecuritySettings,
  updateAdminSecuritySettings,
  type AdminSecurityPreferencesUpdate,
} from '../services/admin-security-settings.service.js';

interface AuthenticatedAdmin {
  id: string;
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

    const updates = res.locals.validated
      .body as AdminSecurityPreferencesUpdate;

    const settings = await updateAdminSecuritySettings(
      admin.id,
      updates,
      req.ip ?? null,
      req.get('user-agent') ?? null,
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
