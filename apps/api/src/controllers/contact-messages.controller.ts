import type { Request, Response } from 'express';

import {
  insertContactMessage,
  type CreateContactMessageInput,
} from '../services/contact-messages.service.js';

export async function createContactMessage(
  req: Request,
  res: Response,
): Promise<void> {
  const input = res.locals.validated?.body as CreateContactMessageInput;

  const createdMessage = await insertContactMessage(input, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  });

  res.status(201).json({
    message: 'Your message has been submitted successfully.',
    data: createdMessage,
  });
}