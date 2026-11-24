
import type { Request, Response } from 'express';
import { findPublishedExperience } from '../services/experience.service.js';

export async function getExperience(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await findPublishedExperience();

  res.status(200).json({
    data: result,
    meta: {
      total: result.length,
    },
  });
}
