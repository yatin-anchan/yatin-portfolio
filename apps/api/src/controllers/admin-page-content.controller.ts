
import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import {
  findAdminPageContent,
  findAdminPageSection,
  upsertPageSection,
  deletePageSection,
  type PageContentInput,
} from '../services/page-content.service.js';

interface AuthenticatedAdmin {
  id: string;
}

interface PageParams {
  page: string;
}

interface SectionParams extends PageParams {
  section: string;
}

function getRequestMetadata(req: Request) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

export async function getAdminPageContent(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = res.locals.validated?.params as PageParams;

    const content = await findAdminPageContent(params.page);

    res.status(200).json({
      success: true,
      data: content,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminPageSection(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = res.locals.validated?.params as SectionParams;

    const section = await findAdminPageSection(
      params.page,
      params.section,
    );

    if (!section) {
      res.status(404).json({
        error: {
          code: 'PAGE_SECTION_NOT_FOUND',
          message: 'Page section was not found.',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: section,
    });
  } catch (error) {
    next(error);
  }
}

export async function saveAdminPageSection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = res.locals.admin as AuthenticatedAdmin;
    const params = res.locals.validated?.params as SectionParams;
    const body = res.locals.validated?.body as PageContentInput;
    const metadata = getRequestMetadata(req);

    const section = await upsertPageSection(
      params.page,
      params.section,
      body,
      admin.id,
      metadata.ipAddress,
      metadata.userAgent,
    );

    res.status(200).json({
      success: true,
      message: 'Page section saved successfully.',
      data: section,
    });
  } catch (error) {
    next(error);
  }
}

export async function removeAdminPageSection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = res.locals.admin as AuthenticatedAdmin;
    const params = res.locals.validated?.params as SectionParams;
    const metadata = getRequestMetadata(req);

    const deleted = await deletePageSection(
      params.page,
      params.section,
      admin.id,
      metadata.ipAddress,
      metadata.userAgent,
    );

    if (!deleted) {
      res.status(404).json({
        error: {
          code: 'PAGE_SECTION_NOT_FOUND',
          message: 'Page section was not found.',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Page section deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
}
