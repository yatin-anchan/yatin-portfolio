import { Router } from 'express';
import { z } from 'zod';

import { createContactMessage } from '../controllers/contact-messages.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();

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
  validate(contactMessageSchema, 'body'),
  createContactMessage,
);

export default router;