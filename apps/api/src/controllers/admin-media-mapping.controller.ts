
import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import {
  findAdminMediaMappings,
  createMediaMapping,
  updateMediaMapping,
  deleteMediaMapping,
  type MediaOwnerType,
  type CreateMediaMappingInput,
  type UpdateMediaMappingInput,
} from '../services/media-mapping.service.js';

interface AuthenticatedAdmin {
  id: string;
}

interface OwnerParams {
  type: MediaOwnerType;
  fid: string;
}

interface MappingParams {
  id: string;
}

function getMetadata(req: Request) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

export async function getAdminMediaMappings(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = res.locals.validated?.params as OwnerParams;

    const media = await findAdminMediaMappings(
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

export async function createAdminMediaMapping(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = res.locals.admin as AuthenticatedAdmin;
    const body = res.locals.validated?.body as CreateMediaMappingInput;
    const metadata = getMetadata(req);

    const media = await createMediaMapping(
      body,
      admin.id,
      metadata.ipAddress,
      metadata.userAgent,
    );

    res.status(201).json({
      success: true,
      message: 'Media mapping created successfully.',
      data: media,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAdminMediaMapping(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = res.locals.admin as AuthenticatedAdmin;
    const params = res.locals.validated?.params as MappingParams;
    const body = res.locals.validated?.body as UpdateMediaMappingInput;
    const metadata = getMetadata(req);

    const media = await updateMediaMapping(
      params.id,
      body,
      admin.id,
      metadata.ipAddress,
      metadata.userAgent,
    );

    if (!media) {
      res.status(404).json({
        error: {
          code: 'MEDIA_MAPPING_NOT_FOUND',
          message: 'Media mapping was not found.',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Media mapping updated successfully.',
      data: media,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteAdminMediaMapping(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = res.locals.admin as AuthenticatedAdmin;
    const params = res.locals.validated?.params as MappingParams;
    const metadata = getMetadata(req);

    const deleted = await deleteMediaMapping(
      params.id,
      admin.id,
      metadata.ipAddress,
      metadata.userAgent,
    );

    if (!deleted) {
      res.status(404).json({
        error: {
          code: 'MEDIA_MAPPING_NOT_FOUND',
          message: 'Media mapping was not found.',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Media mapping deleted. The Cloudinary asset remains untouched.',
    });
  } catch (error) {
    next(error);
  }
}
