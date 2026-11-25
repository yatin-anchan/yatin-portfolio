
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { requireAdmin } from '../middleware/admin-auth.js';
import { validate } from '../middleware/validate.js';

import {
  getAllSiteSettings,
  saveSiteSetting,
} from '../controllers/admin-site-settings.controller.js';

const router = Router();

const managementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'SITE_SETTINGS_RATE_LIMITED',
      message: 'Too many site settings requests.',
    },
  },
});

const paramsSchema = z.object({
  key: z.string()
    .trim()
    .min(1)
    .max(100)
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      'Invalid setting key.',
    ),
}).strict();

const settingSchema = z.object({
  value: z.unknown(),

  description: z.string()
    .max(5000)
    .nullable()
    .optional(),

  group: z.string()
    .trim()
    .min(1)
    .max(50)
    .default('general'),

  isPublic: z.boolean().default(false),
}).strict();

router.use(requireAdmin);
router.use(managementLimiter);

// GET /api/admin/site-settings
router.get('/', getAllSiteSettings);

// PUT /api/admin/site-settings/:key
router.put(
  '/:key',
  validate(paramsSchema, 'params'),
  validate(settingSchema, 'body'),
  saveSiteSetting,
);

export default router;
