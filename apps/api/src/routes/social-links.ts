import { Router } from 'express';
import { z } from 'zod';

import { getSocialLinks } from '../controllers/social-links.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const socialLinksQuerySchema = z.object({
  category: z
    .enum(['social', 'professional', 'website', 'other'])
    .optional(),
});

router.get(
  '/',
  validate(socialLinksQuerySchema, 'query'),
  getSocialLinks,
);

export default router;