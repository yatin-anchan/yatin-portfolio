
import { Router } from 'express';
import { z } from 'zod';

import { validate } from '../middleware/validate.js';
import {
  getPublishedPageContent,
} from '../controllers/page-content.controller.js';

const router = Router();

const pageParamsSchema = z.object({
  page: z.string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/),
}).strict();

// GET /api/pages/:page/content
router.get(
  '/:page',
  validate(pageParamsSchema, 'params'),
  getPublishedPageContent,
);

export default router;
