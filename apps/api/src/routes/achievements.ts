
import { Router } from 'express';
import { z } from 'zod';
import {
  getAchievements,
  getAchievementById,
} from '../controllers/achievements.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const achievementsQuerySchema = z.object({
  category: z.string().trim().min(1).max(50).optional(),
  featured: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

const achievementParamsSchema = z.object({
  id: z.string().uuid(),
});

router.get(
  '/',
  validate(achievementsQuerySchema, 'query'),
  getAchievements,
);

router.get(
  '/:id',
  validate(achievementParamsSchema, 'params'),
  getAchievementById,
);

export default router;
