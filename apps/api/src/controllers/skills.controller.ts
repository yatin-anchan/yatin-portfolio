
import type { Request, Response } from 'express';
import { findPublishedSkills } from '../services/skills.service.js';

interface SkillsQuery {
  category?: string;
  featured?: boolean;
}

export async function getSkills(
  _req: Request,
  res: Response,
): Promise<void> {
  const filters = res.locals.validated.query as SkillsQuery;

  const result = await findPublishedSkills(filters);

  res.status(200).json({
    data: result,
    meta: {
      total: result.length,
      filters: {
        category: filters.category ?? null,
        featured: filters.featured ?? null,
      },
    },
  });
}
