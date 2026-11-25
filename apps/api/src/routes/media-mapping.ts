
import { Router } from 'express';
import { z } from 'zod';

import { validate } from '../middleware/validate.js';
import {
  getPublicMediaMappings,
} from '../controllers/media-mapping.controller.js';

const router = Router();

const ownerParamsSchema = z.object({
  type: z.enum([
    'project',
    'skill',
    'experience',
    'education',
    'certification',
    'achievement',
    'profile',
  ]),
  fid: z.string().uuid(),
}).strict();

// GET /api/media/:type/:fid
router.get(
  '/:type/:fid',
  validate(ownerParamsSchema, 'params'),
  getPublicMediaMappings,
);

export default router;
