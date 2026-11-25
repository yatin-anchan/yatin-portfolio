
import type {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from 'express';

import {
  listPortfolioResource,
  getPortfolioResource,
  createPortfolioResource,
  updatePortfolioResource,
  deletePortfolioResource,
  replaceProjectImages,
  getAdminProfile,
  saveAdminProfile,
  getSocialLinksForAdmin,
} from '../services/admin-portfolio.service.js';

type CollectionName =
  | 'projects'
  | 'skills'
  | 'experience'
  | 'education'
  | 'certifications'
  | 'achievements'
  | 'socialLinks';

interface AdminContext {
  adminId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

function getAdmin(res: Response): AdminContext {
  const admin = res.locals.admin as {
    id: string;
  };

  return {
    adminId: admin.id,
    ipAddress: null,
    userAgent: null,
  };
}

function getContext(req: Request, res: Response): AdminContext {
  const admin = getAdmin(res);

  return {
    ...admin,
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

function asyncHandler(
  callback: (
    req: Request,
    res: Response,
  ) => Promise<void>,
): RequestHandler {
  return (req, res, next: NextFunction) => {
    void callback(req, res).catch(next);
  };
}

function getValidatedBody<T>(res: Response): T {
  return res.locals.validated?.body as T;
}

function getValidatedParams(res: Response): { id: string } {
  return res.locals.validated?.params as { id: string };
}

function getValidatedQuery(res: Response): {
  page: number;
  limit: number;
} {
  return res.locals.validated?.query as {
    page: number;
    limit: number;
  };
}

export function listResource(resource: CollectionName): RequestHandler {
  return asyncHandler(async (_req, res) => {
    const { page, limit } = getValidatedQuery(res);

    const result = await listPortfolioResource(resource, page, limit);

    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  });
}

export function getResource(resource: CollectionName): RequestHandler {
  return asyncHandler(async (_req, res) => {
    const { id } = getValidatedParams(res);

    const result = await getPortfolioResource(resource, id);

    res.status(200).json({
      success: true,
      data: result,
    });
  });
}

export function createResource(
  resource: CollectionName,
): RequestHandler {
  return asyncHandler(async (req, res) => {
    const body = getValidatedBody<Record<string, unknown>>(res);

    const result = await createPortfolioResource(
      resource,
      body,
      getContext(req, res),
    );

    res.status(201).json({
      success: true,
      message: 'Portfolio resource created successfully.',
      data: result,
    });
  });
}

export function updateResource(
  resource: CollectionName,
): RequestHandler {
  return asyncHandler(async (req, res) => {
    const { id } = getValidatedParams(res);
    const body = getValidatedBody<Record<string, unknown>>(res);

    const result = await updatePortfolioResource(
      resource,
      id,
      body,
      getContext(req, res),
    );

    res.status(200).json({
      success: true,
      message: 'Portfolio resource updated successfully.',
      data: result,
    });
  });
}

export function deleteResource(
  resource: CollectionName,
): RequestHandler {
  return asyncHandler(async (req, res) => {
    const { id } = getValidatedParams(res);

    await deletePortfolioResource(
      resource,
      id,
      getContext(req, res),
    );

    res.status(200).json({
      success: true,
      message: 'Portfolio resource deleted successfully.',
    });
  });
}

export const getProfile = asyncHandler(async (_req, res) => {
  const profile = await getAdminProfile();

  res.status(200).json({
    success: true,
    data: profile,
  });
});

export const saveProfile = asyncHandler(async (req, res) => {
  const body = getValidatedBody<Record<string, unknown>>(res);

  const profile = await saveAdminProfile(
    body,
    getContext(req, res),
  );

  res.status(200).json({
    success: true,
    message: 'Profile saved successfully.',
    data: profile,
  });
});

export const listSocialLinks = asyncHandler(async (_req, res) => {
  const links = await getSocialLinksForAdmin();

  res.status(200).json({
    success: true,
    data: links,
  });
});

export const updateProjectImages = asyncHandler(async (req, res) => {
  const { id } = getValidatedParams(res);

  const { images } = getValidatedBody<{
    images: Array<{
      imageUrl: string;
      altText: string;
      caption?: string | null;
      displayOrder: number;
    }>;
  }>(res);

  const result = await replaceProjectImages(
    id,
    images,
    getContext(req, res),
  );

  res.status(200).json({
    success: true,
    message: 'Project images updated successfully.',
    data: result,
  });
});
