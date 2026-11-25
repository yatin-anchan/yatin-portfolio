
import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import {
  findPublicSiteSettings,
} from '../services/site-settings.service.js';

export async function getPublicSiteSettings(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const settings = await findPublicSiteSettings();

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    next(error);
  }
}
