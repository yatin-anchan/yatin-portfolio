
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { requireAdmin } from '../middleware/admin-auth.js';
import { validate } from '../middleware/validate.js';

import {
  getAdminPageContent,
  getAdminPageSection,
  saveAdminPageSection,
  removeAdminPageSection,
} from '../controllers/admin-page-content.controller.js';

const router = Router();

const managementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'PAGE_CONTENT_RATE_LIMITED',
      message: 'Too many page content requests.',
    },
  },
});

const pageParamsSchema = z.object({
  page: z.string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/),
}).strict();

const sectionParamsSchema = pageParamsSchema.extend({
  section: z.string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/),
}).strict();

const contentBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('heading'),
    level: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
    ]),
    text: z.string().min(1).max(10000),
  }).strict(),

  z.object({
    type: z.literal('paragraph'),
    text: z.string().min(1).max(50000),
  }).strict(),

  z.object({
    type: z.literal('image'),
    url: z.string().url(),
    alt: z.string().min(1).max(300),
    caption: z.string().max(1000).optional(),
  }).strict(),

  z.object({
    type: z.literal('list'),
    items: z.array(
      z.string().min(1).max(5000),
    ).max(100),
  }).strict(),

  z.object({
    type: z.literal('code'),
    language: z.string().min(1).max(50),
    code: z.string().max(50000),
  }).strict(),
]);

const pageContentSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  subtitle: z.string().max(250).nullable().optional(),

  content: z.object({
    version: z.literal(1),
    blocks: z.array(contentBlockSchema).max(200),
  }).strict().nullable().optional(),

  status: z.enum(['draft', 'published']).default('draft'),
  isVisible: z.boolean().default(true),
  displayOrder: z.number().int().min(0).default(0),
}).strict();

router.use(requireAdmin);
router.use(managementLimiter);

// GET /api/admin/pages/:page/content
router.get(
  '/:page',
  validate(pageParamsSchema, 'params'),
  getAdminPageContent,
);

// GET /api/admin/pages/:page/content/:section
router.get(
  '/:page/:section',
  validate(sectionParamsSchema, 'params'),
  getAdminPageSection,
);

// PUT /api/admin/pages/:page/content/:section
router.put(
  '/:page/:section',
  validate(sectionParamsSchema, 'params'),
  validate(pageContentSchema, 'body'),
  saveAdminPageSection,
);

// DELETE /api/admin/pages/:page/content/:section
router.delete(
  '/:page/:section',
  validate(sectionParamsSchema, 'params'),
  removeAdminPageSection,
);

export default router;
