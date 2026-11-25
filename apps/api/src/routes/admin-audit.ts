
import { Router } from 'express';
import { z } from 'zod';

import { requireAdmin } from '../middleware/admin-auth.js';
import { validate } from '../middleware/validate.js';

import { getAuditHistory } from '../controllers/admin-audit.controller.js';

const router = Router();

const auditQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),

    action: z.string().trim().min(1).max(100).optional(),

    entityType: z.string().trim().min(1).max(100).optional(),

    fromDate: z.string().datetime({ offset: true }).optional(),

    toDate: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine(
    (data) =>
      !data.fromDate ||
      !data.toDate ||
      new Date(data.fromDate) <= new Date(data.toDate),
    {
      message: 'fromDate must be earlier than or equal to toDate.',
    },
  );

router.use(requireAdmin);

// GET /api/admin/audit
router.get(
  '/',
  validate(auditQuerySchema, 'query'),
  getAuditHistory,
);

export default router;
