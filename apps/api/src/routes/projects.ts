
import { Router } from 'express';
import { z } from 'zod';
import {
  getProjects,
  getProjectBySlug,
} from '../controllers/projects.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const projectsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const projectParamsSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(220)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

// GET /api/projects?page=1&limit=10
router.get(
  '/',
  validate(projectsQuerySchema, 'query'),
  getProjects,
);

// GET /api/projects/:slug
router.get(
  '/:slug',
  validate(projectParamsSchema, 'params'),
  getProjectBySlug,
);

export default router;
