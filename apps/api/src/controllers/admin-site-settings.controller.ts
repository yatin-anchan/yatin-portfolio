
import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import {
  findAllSiteSettings,
  upsertSiteSetting,
  type SiteSettingInput,
} from '../services/site-settings.service.js';

interface AuthenticatedAdmin {
  id: string;
}

interface SettingParams {
  key: string;
}

export async function getAllSiteSettings(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const settings = await findAllSiteSettings();

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    next(error);
  }
}

export async function saveSiteSetting(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = res.locals.admin as AuthenticatedAdmin;
    const params = res.locals.validated?.params as SettingParams;
    const body = res.locals.validated?.body as SiteSettingInput;

    const ipAddress = req.ip ?? null;
    const userAgent = req.get('user-agent') ?? null;

    const setting = await upsertSiteSetting(
      params.key,
      body,
      admin.id,
      ipAddress,
      userAgent,
    );

    res.status(200).json({
      success: true,
      message: 'Site setting saved successfully.',
      data: setting,
    });
  } catch (error) {
    next(error);
  }
}
