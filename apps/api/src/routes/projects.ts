import { Router } from 'express';
import {
  getProjects,
  getProjectById,
} from '../controllers/projects.controller.js';

import { z } from 'zod';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/', getProjects);
router.get(
  '/:slug',
  validate(
    z.object({
      slug: z.string().min(1).max(220).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    }),
    'params',
  ),
  getProjectById,
);

export default router;