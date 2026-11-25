import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { createContactMessage } from '../controllers/contact-messages.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// The default express-rate-limit store is process-local; use shared storage
// before deploying multiple API instances.
const contactSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'CONTACT_RATE_LIMITED',
      message: 'Too many contact submissions. Please try again later.',
    },
  },
});

const contactMessageSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    email: z.string().trim().email().max(255),
    subject: z.string().trim().min(2).max(200),
    message: z.string().trim().min(10).max(10000),

    attachmentUrl: z.string().trim().url().optional(),
    attachmentName: z.string().trim().min(1).max(255).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasUrl = Boolean(data.attachmentUrl);
    const hasName = Boolean(data.attachmentName);

    if (hasUrl !== hasName) {
      ctx.addIssue({
        code: 'custom',
        message: 'Attachment URL and attachment name must be provided together.',
        path: ['attachmentUrl'],
      });
    }
  });

router.post(
  '/',
  contactSubmissionLimiter,
  validate(contactMessageSchema, 'body'),
  createContactMessage,
);

export default router;