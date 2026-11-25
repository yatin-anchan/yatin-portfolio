
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { requireAdmin } from '../middleware/admin-auth.js';
import { validate } from '../middleware/validate.js';

import {
  createUploadSignature,
  deleteMedia,
} from '../controllers/admin-media.controller.js';

const router = Router();

const mediaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'MEDIA_RATE_LIMITED',
      message: 'Too many media management requests. Try again later.',
    },
  },
});

const uploadSignatureSchema = z.object({
  category: z.enum([
    'projects',
    'profile',
    'experience',
    'education',
    'certifications',
    'achievements',
    'resume',
  ]),
  resourceType: z.enum(['image', 'raw']),
}).strict();

const deleteMediaSchema = z.object({
  publicId: z.string()
    .trim()
    .min(1)
    .max(500)
    .regex(
      /^portfolio\/[a-zA-Z0-9_./-]+$/,
      'Invalid portfolio media public ID.',
    ),
  resourceType: z.enum(['image', 'raw']),
}).strict();

router.use(requireAdmin);
router.use(mediaLimiter);

// POST /api/admin/media/upload-signature
router.post(
  '/upload-signature',
  validate(uploadSignatureSchema, 'body'),
  createUploadSignature,
);

// DELETE /api/admin/media
router.delete(
  '/',
  validate(deleteMediaSchema, 'body'),
  deleteMedia,
);

export default router;
