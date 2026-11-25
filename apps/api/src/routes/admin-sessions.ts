
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { requireAdmin } from '../middleware/admin-auth.js';
import { validate } from '../middleware/validate.js';

import {
  getSessions,
  revokeSession,
  revokeOtherSessions,
} from '../controllers/admin-sessions.controller.js';

const router = Router();

const sessionManagementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'SESSION_MANAGEMENT_RATE_LIMITED',
      message: 'Too many session management requests. Try again later.',
    },
  },
});

const sessionIdSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

// All session management operations require authentication.
router.use(requireAdmin);

// GET /api/admin/sessions
router.get('/', getSessions);

// DELETE /api/admin/sessions/:id
router.delete(
  '/:id',
  sessionManagementLimiter,
  validate(sessionIdSchema, 'params'),
  revokeSession,
);

// POST /api/admin/sessions/revoke-others
router.post(
  '/revoke-others',
  sessionManagementLimiter,
  revokeOtherSessions,
);

export default router;
