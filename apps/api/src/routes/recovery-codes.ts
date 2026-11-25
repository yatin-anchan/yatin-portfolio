
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { requireAdmin } from '../middleware/admin-auth.js';
import { validate } from '../middleware/validate.js';

import {
  getRecoveryCodeStatus,
  regenerateRecoveryCodes,
} from '../controllers/recovery-codes.controller.js';

const router = Router();

const recoveryCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RECOVERY_CODE_RATE_LIMITED',
      message: 'Too many recovery-code requests. Try again later.',
    },
  },
});

const regenerateSchema = z.object({
  currentPassword: z.string().min(1).max(128),
}).strict();

router.use(requireAdmin);

// GET /api/admin/recovery-codes
router.get('/', getRecoveryCodeStatus);

// POST /api/admin/recovery-codes/regenerate
router.post(
  '/regenerate',
  recoveryCodeLimiter,
  validate(regenerateSchema, 'body'),
  regenerateRecoveryCodes,
);

export default router;
