
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { requireAdmin } from '../middleware/admin-auth.js';
import { validate } from '../middleware/validate.js';

import {
  CONTACT_MESSAGE_STATUSES,
} from '../services/admin-contact-messages.service.js';

import {
  listMessages,
  getMessage,
  changeMessageStatus,
  saveMessageNotes,
  replyToMessage,
  removeMessage,
} from '../controllers/admin-contact-messages.controller.js';

const router = Router();

const messageManagementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'CONTACT_MANAGEMENT_RATE_LIMITED',
      message: 'Too many contact management requests. Try again later.',
    },
  },
});

const replyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'CONTACT_REPLY_RATE_LIMITED',
      message: 'Too many email replies. Try again later.',
    },
  },
});

const paramsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

const listMessagesSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(CONTACT_MESSAGE_STATUSES).optional(),
    search: z.string().trim().min(1).max(200).optional(),
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

const updateStatusSchema = z
  .object({
    status: z.enum(CONTACT_MESSAGE_STATUSES),
  })
  .strict();

const updateNotesSchema = z
  .object({
    notes: z.string().trim().max(10000),
  })
  .strict();

const replySchema = z
  .object({
    reply: z.string().trim().min(1).max(10000),
  })
  .strict();

// All administrative contact endpoints require authentication.
router.use(requireAdmin);

// GET /api/admin/contact-messages
router.get(
  '/',
  validate(listMessagesSchema, 'query'),
  listMessages,
);

// GET /api/admin/contact-messages/:id
router.get(
  '/:id',
  validate(paramsSchema, 'params'),
  getMessage,
);

// PATCH /api/admin/contact-messages/:id/status
router.patch(
  '/:id/status',
  messageManagementLimiter,
  validate(paramsSchema, 'params'),
  validate(updateStatusSchema, 'body'),
  changeMessageStatus,
);

// PATCH /api/admin/contact-messages/:id/notes
router.patch(
  '/:id/notes',
  messageManagementLimiter,
  validate(paramsSchema, 'params'),
  validate(updateNotesSchema, 'body'),
  saveMessageNotes,
);

// POST /api/admin/contact-messages/:id/reply
router.post(
  '/:id/reply',
  replyLimiter,
  validate(paramsSchema, 'params'),
  validate(replySchema, 'body'),
  replyToMessage,
);

// DELETE /api/admin/contact-messages/:id
router.delete(
  '/:id',
  messageManagementLimiter,
  validate(paramsSchema, 'params'),
  removeMessage,
);

export default router;
