
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import {
  login,
  logout,
  getCurrentAdmin,
  forgotPassword,
  resetPassword,
  recoverWithRecoveryCode,
  requestSensitiveActionVerification,
} from '../controllers/admin-auth.controller.js';

import { validate } from '../middleware/validate.js';
import { requireAdmin } from '../middleware/admin-auth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'LOGIN_RATE_LIMITED',
      message: 'Too many login attempts. Try again later.',
    },
  },
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'PASSWORD_RESET_RATE_LIMITED',
      message: 'Too many password reset attempts. Try again later.',
    },
  },
});

const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RECOVERY_RATE_LIMITED',
      message: 'Too many recovery attempts. Try again later.',
    },
  },
});

const sensitiveActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

const loginSchema = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(128),
  })
  .strict();

  const recoverySchema = z
  .object({
    email: z.string().trim().email().max(254),
    recoveryCode: z
      .string()
      .trim()
      .regex(
        /^[A-Fa-f0-9]{8}-?[A-Fa-f0-9]{8}$/,
        'Invalid recovery code format.',
      ),
  })
  .strict();

const forgotPasswordSchema = z
  .object({
    email: z.string().trim().email().max(254),
  })
  .strict();

const resetPasswordSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    newPassword: z.string().min(12).max(128),
    verificationCode: z.string().regex(/^\d{6}$/).optional(),
  })
  .strict();

const sensitiveActionSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
  })
  .strict();

router.post(
  '/sensitive-action/request',
  requireAdmin,
  sensitiveActionLimiter,
  validate(sensitiveActionSchema, 'body'),
  requestSensitiveActionVerification,
);

router.post(
  '/login',
  loginLimiter,
  validate(loginSchema, 'body'),
  login,
);

router.post(
  '/forgot-password',
  passwordResetLimiter,
  validate(forgotPasswordSchema, 'body'),
  forgotPassword,
);

router.post(
  '/reset-password',
  passwordResetLimiter,
  validate(resetPasswordSchema, 'body'),
  resetPassword,
);

router.post('/logout', logout);

router.get('/me', requireAdmin, getCurrentAdmin);

router.post(
  '/recover',
  recoveryLimiter,
  validate(recoverySchema, 'body'),
  recoverWithRecoveryCode,
);

export default router;
