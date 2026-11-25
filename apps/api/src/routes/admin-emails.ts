
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { requireAdmin } from '../middleware/admin-auth.js';
import { validate } from '../middleware/validate.js';

import {
  listAdminEmails,
  addEmail,
  verifyEmail,
  requestPrimaryEmailChange,
  verifyPrimaryEmailChange,
  deleteEmail,
} from '../controllers/admin-emails.controller.js';

const router = Router();

const emailManagementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'EMAIL_MANAGEMENT_RATE_LIMITED',
      message: 'Too many email management requests. Try again later.',
    },
  },
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'EMAIL_OTP_RATE_LIMITED',
      message: 'Too many verification attempts. Try again later.',
    },
  },
});

const emailIdSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

const addEmailSchema = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(12).max(128),
  })
  .strict();

const verifyEmailSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();

  const deleteEmailSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
  })
  .strict();

// Every endpoint in this router requires an authenticated admin.
router.use(requireAdmin);

// GET /api/admin/emails
router.get(
  '/',
  listAdminEmails,
);

// POST /api/admin/emails
router.post(
  '/',
  emailManagementLimiter,
  validate(addEmailSchema, 'body'),
  addEmail,
);

// POST /api/admin/emails/:id/verify
router.post(
  '/:id/verify',
  otpLimiter,
  validate(emailIdSchema, 'params'),
  validate(verifyEmailSchema, 'body'),
  verifyEmail,
);

// POST /api/admin/emails/:id/primary/request
router.post(
  '/:id/primary/request',
  emailManagementLimiter,
  validate(emailIdSchema, 'params'),
  requestPrimaryEmailChange,
);

// POST /api/admin/emails/:id/primary/verify
router.post(
  '/:id/primary/verify',
  otpLimiter,
  validate(emailIdSchema, 'params'),
  validate(verifyEmailSchema, 'body'),
  verifyPrimaryEmailChange,
);

// DELETE /api/admin/emails/:id
router.delete(
  '/:id',
  emailManagementLimiter,
  validate(emailIdSchema, 'params'),
  validate(deleteEmailSchema, 'body'),
  deleteEmail,
);

export default router;
