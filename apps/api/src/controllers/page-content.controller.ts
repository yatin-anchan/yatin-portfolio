
import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import {
  findPublishedPageContent,
} from '../services/page-content.service.js';

interface PageParams {
  page: string;
}

export async function getPublishedPageContent(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = res.locals.validated?.params as PageParams;

    const content = await findPublishedPageContent(params.page);

    res.status(200).json({
      success: true,
      data: content,
    });
  } catch (error) {
    next(error);
  }
}
