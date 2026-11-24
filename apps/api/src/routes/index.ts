import { Router } from 'express';

import projectsRouter from './projects.js';
import skillsRouter from './skills.js';
import experienceRouter from './experience.js';
import educationRouter from './education.js';
import certificationsRouter from './certifications.js';
import achievementsRouter from './achievements.js';
import profileRouter from './profile.js';
import socialLinksRouter from './social-links.js';
import contactMessagesRouter from './contact-messages.js';
import adminAuthRouter from './admin-auth.js';

const router = Router();

router.use('/projects', projectsRouter);
router.use('/skills', skillsRouter);
router.use('/experience', experienceRouter);
router.use('/education', educationRouter);
router.use('/certifications', certificationsRouter);
router.use('/achievements', achievementsRouter);
router.use('/profile', profileRouter);
router.use('/social-links', socialLinksRouter);
router.use('/contact-messages', contactMessagesRouter);

router.use('/admin/auth', adminAuthRouter);

export default router;