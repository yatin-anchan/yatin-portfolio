import type { Request, Response } from 'express';

import {
  findVisibleSocialLinks,
  type SocialLinksFilters,
} from '../services/social-links.service.js';

export async function getSocialLinks(
  _req: Request,
  res: Response,
): Promise<void> {
  const filters = res.locals.validated?.query as SocialLinksFilters;

  const links = await findVisibleSocialLinks(filters);

  res.status(200).json({
    data: links,
    meta: {
      total: links.length,
      filters,
    },
  });
}