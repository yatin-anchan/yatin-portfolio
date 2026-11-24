
import type { Request, Response } from 'express';
import {
  findPublishedAchievements,
  findPublishedAchievementById,
} from '../services/achievements.service.js';

interface AchievementQuery {
  category?: string;
  featured?: boolean;
}

interface AchievementParams {
  id: string;
}

export async function getAchievements(
  _req: Request,
  res: Response,
): Promise<void> {
  const filters = res.locals.validated.query as AchievementQuery;

  const result = await findPublishedAchievements(filters);

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

export async function getAchievementById(
  _req: Request,
  res: Response,
): Promise<void> {
  const { id } = res.locals.validated.params as AchievementParams;

  const achievement = await findPublishedAchievementById(id);

  if (!achievement) {
    res.status(404).json({
      error: {
        code: 'ACHIEVEMENT_NOT_FOUND',
        message: 'Achievement not found.',
      },
    });
    return;
  }

  res.status(200).json({
    data: achievement,
  });
}
