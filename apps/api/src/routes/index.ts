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
import adminEmailsRouter from './admin-emails.js';
import backupEmailRouter from './backup-email.js';
import adminPasswordRouter from './admin-password.js';
import recoveryCodesRouter from './recovery-codes.js';
import adminSecuritySettingsRouter from './admin-security-settings.js';
import adminSessionsRouter from './admin-sessions.js';
import adminAuditRouter from './admin-audit.js';
import adminContactMessagesRouter from './admin-contact-messages.js';
import adminPortfolioRouter from './admin-portfolio.js';
import adminMediaRouter from './admin-media.js';
import siteSettingsRouter from './site-settings.js';
import adminSiteSettingsRouter from './admin-site-settings.js';
import pageContentRouter from './page-content.js';
import adminPageContentRouter from './admin-page-content.js';
import mediaMappingRouter from './media-mapping.js';
import adminMediaMappingRouter from './admin-media-mapping.js';


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
router.use('/admin/emails', adminEmailsRouter);
router.use('/admin/backup-email', backupEmailRouter);
router.use('/admin/password', adminPasswordRouter);
router.use('/admin/recovery-codes', recoveryCodesRouter);
router.use('/admin/security-settings', adminSecuritySettingsRouter);
router.use('/admin/sessions', adminSessionsRouter);
router.use('/admin/audit', adminAuditRouter);
router.use('/admin/contact-messages', adminContactMessagesRouter);
router.use('/admin/portfolio', adminPortfolioRouter);
router.use('/admin/media', adminMediaRouter);
router.use('/site-settings', siteSettingsRouter);
router.use('/admin/site-settings', adminSiteSettingsRouter);
router.use('/pages', pageContentRouter);
router.use('/admin/pages', adminPageContentRouter);
router.use('/media', mediaMappingRouter);
router.use('/admin/media-mappings', adminMediaMappingRouter);

router.use('/admin/auth', adminAuthRouter);

export default router;