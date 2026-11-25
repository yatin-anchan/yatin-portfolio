
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { requireAdmin } from '../middleware/admin-auth.js';
import { validate } from '../middleware/validate.js';

import {
  getSecuritySettings,
  updateSecuritySettings,
} from '../controllers/admin-security-settings.controller.js';

const router = Router();

const settingsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'SECURITY_SETTINGS_RATE_LIMITED',
      message: 'Too many security settings requests. Try again later.',
    },
  },
});

const updateSettingsSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    verificationCode: z.string().regex(/^\d{6}$/),
    requireDualVerification: z.boolean().optional(),
    loginNotificationEnabled: z.boolean().optional(),
    securityNotificationEnabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one security preference must be provided.',
  );

router.use(requireAdmin);

// GET /api/admin/security-settings
router.get('/', getSecuritySettings);

// PATCH /api/admin/security-settings
router.patch(
  '/',
  settingsLimiter,
  validate(updateSettingsSchema, 'body'),
  updateSecuritySettings,
);

export default router;
