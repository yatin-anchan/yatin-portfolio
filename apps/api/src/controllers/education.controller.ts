
import type { Request, Response } from 'express';
import { findPublishedEducation } from '../services/education.service.js';

export async function getEducation(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await findPublishedEducation();

  res.status(200).json({
    data: result,
    meta: {
      total: result.length,
    },
  });
}
