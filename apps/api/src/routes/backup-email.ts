
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { requireAdmin } from '../middleware/admin-auth.js';
import { validate } from '../middleware/validate.js';

import {
  getBackupEmail,
  addBackupEmailAddress,
  verifyBackupEmailAddress,
  deleteBackupEmail,
} from '../controllers/backup-email.controller.js';

const router = Router();

const deleteBackupEmailSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
  })
  .strict();  

const managementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'BACKUP_EMAIL_RATE_LIMITED',
      message: 'Too many backup email requests. Try again later.',
    },
  },
});

const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'BACKUP_EMAIL_OTP_RATE_LIMITED',
      message: 'Too many verification attempts. Try again later.',
    },
  },
});

const addBackupEmailSchema = z
  .object({
    email: z.string().trim().email().max(254),
  })
  .strict();

const verifyBackupEmailSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();

// All backup email operations require an authenticated administrator.
router.use(requireAdmin);

// GET /api/admin/backup-email
router.get('/', getBackupEmail);

// POST /api/admin/backup-email
router.post(
  '/',
  managementLimiter,
  validate(addBackupEmailSchema, 'body'),
  addBackupEmailAddress,
);

// POST /api/admin/backup-email/verify
router.post(
  '/verify',
  verificationLimiter,
  validate(verifyBackupEmailSchema, 'body'),
  verifyBackupEmailAddress,
);

// DELETE /api/admin/backup-email
router.delete(
  '/',
  managementLimiter,
  validate(deleteBackupEmailSchema, 'body'),
  deleteBackupEmail,
);

export default router;
