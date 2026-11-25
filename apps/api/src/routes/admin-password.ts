
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { requireAdmin } from '../middleware/admin-auth.js';
import { validate } from '../middleware/validate.js';
import { changePassword } from '../controllers/admin-password.controller.js';

const router = Router();

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'PASSWORD_CHANGE_RATE_LIMITED',
      message: 'Too many password change attempts. Try again later.',
    },
  },
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z
      .string()
      .min(12)
      .max(128)
      .regex(/[a-z]/)
      .regex(/[A-Z]/)
      .regex(/[0-9]/)
      .regex(/[^A-Za-z0-9]/),
  })
  .strict();

// Every endpoint requires an authenticated admin.
router.use(requireAdmin);

// POST /api/admin/password/change
router.post(
  '/change',
  passwordChangeLimiter,
  validate(changePasswordSchema, 'body'),
  changePassword,
);

export default router;
