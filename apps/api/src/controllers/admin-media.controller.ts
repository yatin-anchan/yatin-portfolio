
import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import {
  createMediaUploadSignature,
  deleteCloudinaryMedia,
  type MediaCategory,
  type MediaResourceType,
} from '../services/admin-media.service.js';

interface ValidatedUploadBody {
  category: MediaCategory;
  resourceType: MediaResourceType;
}

interface ValidatedDeleteBody {
  publicId: string;
  resourceType: MediaResourceType;
}

interface AuthenticatedAdmin {
  id: string;
}

function getAdmin(res: Response) {
  const admin = res.locals.admin as AuthenticatedAdmin;

  return {
    adminId: admin.id,
    ipAddress: null as string | null,
    userAgent: null as string | null,
  };
}

function getContext(req: Request, res: Response) {
  return {
    ...getAdmin(res),
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

export async function createUploadSignature(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = res.locals.validated?.body as ValidatedUploadBody;

    const result = await createMediaUploadSignature(
      body.category,
      body.resourceType,
      getContext(req, res),
    );

    res.status(200).json({
      success: true,
      message: 'Upload authorization created.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteMedia(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = res.locals.validated?.body as ValidatedDeleteBody;

    const result = await deleteCloudinaryMedia(
      body.publicId,
      body.resourceType,
      getContext(req, res),
    );

    res.status(200).json({
      success: true,
      message: 'Media asset deleted successfully.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
