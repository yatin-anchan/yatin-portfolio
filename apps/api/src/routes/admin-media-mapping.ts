
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { requireAdmin } from '../middleware/admin-auth.js';
import { validate } from '../middleware/validate.js';

import {
  getAdminMediaMappings,
  createAdminMediaMapping,
  updateAdminMediaMapping,
  deleteAdminMediaMapping,
} from '../controllers/admin-media-mapping.controller.js';

const router = Router();

const managementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'MEDIA_MAPPING_RATE_LIMITED',
      message: 'Too many media mapping requests.',
    },
  },
});

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

const mappingParamsSchema = z.object({
  id: z.string().uuid(),
}).strict();

const createSchema = z.object({
  fid: z.string().uuid(),
  type: z.enum([
    'project',
    'skill',
    'experience',
    'education',
    'certification',
    'achievement',
    'profile',
  ]),
  url: z.string().url().max(2000),
  mediaType: z.enum([
    'image',
    'document',
    'video',
    'audio',
    'other',
  ]),
  mimeType: z.string().max(100).nullable().optional(),
  fileName: z.string().max(255).nullable().optional(),
  fileSize: z.number().int().nonnegative().nullable().optional(),
  altText: z.string().max(300).nullable().optional(),
  caption: z.string().max(10000).nullable().optional(),
  storageProvider: z.string().max(50).nullable().optional(),
  storageKey: z.string().max(2000).nullable().optional(),
  externalUrl: z.string().url().max(2000).nullable().optional(),
  isPrimary: z.boolean().default(false),
  isVisible: z.boolean().default(true),
}).strict();

const updateSchema = z.object({
  url: z.string().url().max(2000).optional(),
  mediaType: z.enum([
    'image',
    'document',
    'video',
    'audio',
    'other',
  ]).optional(),
  mimeType: z.string().max(100).nullable().optional(),
  fileName: z.string().max(255).nullable().optional(),
  fileSize: z.number().int().nonnegative().nullable().optional(),
  altText: z.string().max(300).nullable().optional(),
  caption: z.string().max(10000).nullable().optional(),
  storageProvider: z.string().max(50).nullable().optional(),
  storageKey: z.string().max(2000).nullable().optional(),
  externalUrl: z.string().url().max(2000).nullable().optional(),
  isPrimary: z.boolean().optional(),
  isVisible: z.boolean().optional(),
}).strict().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided.' },
);

router.use(requireAdmin);
router.use(managementLimiter);

// GET /api/admin/media-mappings/:type/:fid
router.get(
  '/:type/:fid',
  validate(ownerParamsSchema, 'params'),
  getAdminMediaMappings,
);

// POST /api/admin/media-mappings
router.post(
  '/',
  validate(createSchema, 'body'),
  createAdminMediaMapping,
);

// PATCH /api/admin/media-mappings/:id
router.patch(
  '/:id',
  validate(mappingParamsSchema, 'params'),
  validate(updateSchema, 'body'),
  updateAdminMediaMapping,
);

// DELETE /api/admin/media-mappings/:id
router.delete(
  '/:id',
  validate(mappingParamsSchema, 'params'),
  deleteAdminMediaMapping,
);

export default router;
