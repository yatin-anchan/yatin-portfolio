
import { Router } from 'express';
import { z } from 'zod';
import { getSkills } from '../controllers/skills.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const skillsQuerySchema = z.object({
  category: z.string().trim().min(1).max(100).optional(),
  featured: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

router.get(
  '/',
  validate(skillsQuerySchema, 'query'),
  getSkills,
);

export default router;
