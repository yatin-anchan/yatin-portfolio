
import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import {
  findPublicMediaMappings,
  type MediaOwnerType,
} from '../services/media-mapping.service.js';

interface MediaParams {
  type: MediaOwnerType;
  fid: string;
}

export async function getPublicMediaMappings(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = res.locals.validated?.params as MediaParams;

    const media = await findPublicMediaMappings(
      params.type,
      params.fid,
    );

    res.status(200).json({
      success: true,
      data: media,
    });
  } catch (error) {
    next(error);
  }
}
