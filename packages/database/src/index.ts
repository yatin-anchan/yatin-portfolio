
export { db, pool } from './client.js';

// Admin schemas
export { adminUsers } from './schema/admin-users.js';
export { adminEmails } from './schema/admin-emails.js';
export { adminSessions } from './schema/admin-sessions.js';
export { adminPasswordResets } from './schema/admin-password-resets.js';
export { adminEmailVerifications } from './schema/admin-email-verifications.js';
export { adminSecuritySettings } from './schema/admin-security-settings.js';
export { adminRecoveryCodes } from './schema/admin-recovery-codes.js';
export { adminAuditLogs } from './schema/admin-audit-logs.js';

// Portfolio schemas
export * from './schema/projects.js';
export * from './schema/experience.js';
export * from './schema/education.js';
export * from './schema/certifications.js';
export * from './schema/achievements.js';
export * from './schema/profiles.js';
export * from './schema/social-links.js';
export * from './schema/contact-messages.js';
export * from './schema/mapping.js';
export * from './schema/site-settings.js';
export * from './schema/page-content.js';
