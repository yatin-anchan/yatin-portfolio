
import { Router } from 'express';

import {
  getPublicSiteSettings,
} from '../controllers/site-settings.controller.js';

const router = Router();

// GET /api/site-settings
router.get('/', getPublicSiteSettings);

export default router;
