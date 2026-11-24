
import type { Request, Response } from 'express';
import {
  findPublishedCertifications,
} from '../services/certifications.service.js';

export async function getCertifications(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await findPublishedCertifications();

  res.status(200).json({
    data: result,
    meta: {
      total: result.length,
    },
  });
}
