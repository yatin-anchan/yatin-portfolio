
import { and, eq, isNull } from 'drizzle-orm';

import {
  db,
  adminEmails,
  adminSecuritySettings,
} from '@yatin-portfolio/database';

import { ApiError } from '../lib/errors/api-error.js';
import { logger } from '../lib/logger.js';
import { logAdminAudit } from './admin-audit.service.js';
import { sendEmail } from './email.service.js';
import { verifyOtpAndRun } from './otp.service.js';

export interface AdminSecurityPreferences {
  requireDualVerification: boolean;
  loginNotificationEnabled: boolean;
  securityNotificationEnabled: boolean;
}

export type AdminSecurityPreferencesUpdate =
  Partial<AdminSecurityPreferences>;

export async function getTrustedPrimaryAdminEmail(
  adminUserId: string,
): Promise<{ id: string; email: string }> {
  const [email] = await db
    .select({
      id: adminEmails.id,
      email: adminEmails.email,
    })
    .from(adminEmails)
    .where(
      and(
        eq(adminEmails.adminUserId, adminUserId),
        eq(adminEmails.isPrimary, true),
        eq(adminEmails.isVerified, true),
        isNull(adminEmails.removedAt),
      ),
    )
    .limit(1);

  if (!email) {
    throw new ApiError(
      409,
      'TRUSTED_EMAIL_NOT_FOUND',
      'A verified primary login email is required for this action.',
    );
  }

  return email;
}

export async function notifyAdminLogin(
  adminUserId: string,
  recipient: string,
): Promise<void> {
  try {
    const [settings] = await db
      .select({
        enabled: adminSecuritySettings.loginNotificationEnabled,
      })
      .from(adminSecuritySettings)
      .where(eq(adminSecuritySettings.adminUserId, adminUserId))
      .limit(1);

    if (!settings?.enabled) return;

    await sendEmail({
      to: recipient,
      subject: 'Administrator sign-in notification',
      text: 'A new sign-in to your administrator account was completed. If this was not you, review your active sessions and change your password.',
    });
  } catch {
    logger.warn('Administrator login notification delivery failed.');
  }
}

export async function notifyAdminSecurityEvent(
  adminUserId: string,
  recipient: string,
  event: string,
): Promise<void> {
  try {
    const [settings] = await db
      .select({
        enabled: adminSecuritySettings.securityNotificationEnabled,
      })
      .from(adminSecuritySettings)
      .where(eq(adminSecuritySettings.adminUserId, adminUserId))
      .limit(1);

    if (!settings?.enabled) return;

    await sendEmail({
      to: recipient,
      subject: 'Administrator security notification',
      text: `${event} If this was not you, review your active sessions and secure your account.`,
    });
  } catch {
    logger.warn('Administrator security notification delivery failed.');
  }
}

export async function getAdminSecuritySettings(
  adminUserId: string,
): Promise<AdminSecurityPreferences> {
  const [settings] = await db
    .select({
      requireDualVerification:
        adminSecuritySettings.requireDualVerification,
      loginNotificationEnabled:
        adminSecuritySettings.loginNotificationEnabled,
      securityNotificationEnabled:
        adminSecuritySettings.securityNotificationEnabled,
    })
    .from(adminSecuritySettings)
    .where(
      eq(adminSecuritySettings.adminUserId, adminUserId),
    )
    .limit(1);

  if (!settings) {
    throw new ApiError(
      404,
      'SECURITY_SETTINGS_NOT_FOUND',
      'Administrator security settings were not found.',
    );
  }

  return settings;
}

export async function updateAdminSecuritySettings(
  adminUserId: string,
  authenticatedEmailId: string,
  expectedPasswordHash: string,
  trustedEmailId: string,
  updates: AdminSecurityPreferencesUpdate,
  verificationCode: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<AdminSecurityPreferences> {
  if (Object.keys(updates).length === 0) {
    throw new ApiError(
      400,
      'EMPTY_SECURITY_SETTINGS_UPDATE',
      'At least one security preference is required.',
    );
  }

  let updatedSettings: AdminSecurityPreferences | null = null;

  const authorized = await verifyOtpAndRun(
    adminUserId,
    'sensitive_action',
    verificationCode,
    'login_email',
    trustedEmailId,
    async (tx) => {
    const [authenticatedEmail] = await tx
      .select({ id: adminEmails.id })
      .from(adminEmails)
      .where(
        and(
          eq(adminEmails.id, authenticatedEmailId),
          eq(adminEmails.adminUserId, adminUserId),
          eq(adminEmails.passwordHash, expectedPasswordHash),
          eq(adminEmails.isVerified, true),
          isNull(adminEmails.removedAt),
        ),
      )
      .for('update')
      .limit(1);

    const [trustedEmail] = await tx
      .select({ id: adminEmails.id })
      .from(adminEmails)
      .where(
        and(
          eq(adminEmails.id, trustedEmailId),
          eq(adminEmails.adminUserId, adminUserId),
          eq(adminEmails.isPrimary, true),
          eq(adminEmails.isVerified, true),
          isNull(adminEmails.removedAt),
        ),
      )
      .for('update')
      .limit(1);

    if (!authenticatedEmail || !trustedEmail) {
      return false;
    }

    const [existing] = await tx
      .select({
        id: adminSecuritySettings.id,
        requireDualVerification:
          adminSecuritySettings.requireDualVerification,
        loginNotificationEnabled:
          adminSecuritySettings.loginNotificationEnabled,
        securityNotificationEnabled:
          adminSecuritySettings.securityNotificationEnabled,
      })
      .from(adminSecuritySettings)
      .where(
        eq(adminSecuritySettings.adminUserId, adminUserId),
      )
      .for('update')
      .limit(1);

    if (!existing) {
      throw new ApiError(
        404,
        'SECURITY_SETTINGS_NOT_FOUND',
        'Administrator security settings were not found.',
      );
    }

    const [updated] = await tx
      .update(adminSecuritySettings)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(
        eq(adminSecuritySettings.id, existing.id),
      )
      .returning({
        requireDualVerification:
          adminSecuritySettings.requireDualVerification,
        loginNotificationEnabled:
          adminSecuritySettings.loginNotificationEnabled,
        securityNotificationEnabled:
          adminSecuritySettings.securityNotificationEnabled,
      });

    if (!updated) {
      throw new ApiError(
        500,
        'SECURITY_SETTINGS_UPDATE_FAILED',
        'Unable to update administrator security settings.',
      );
    }

    const changedFields = Object.keys(updates);

    const oldValues = Object.fromEntries(
      changedFields.map((key) => [
        key,
        existing[key as keyof typeof existing],
      ]),
    );

    await logAdminAudit(
      {
        adminId: adminUserId,
        action: 'admin.security_settings_updated',
        entityType: 'admin_security_settings',
        entityId: existing.id,
        description:
          'Administrator updated security preferences.',
        oldValues,
        newValues: updates,
        ipAddress,
        userAgent,
      },
      tx,
    );

    updatedSettings = updated;
    return true;
  },
  );

  if (!authorized || !updatedSettings) {
    throw new ApiError(
      401,
      'TRUSTED_VERIFICATION_FAILED',
      'The trusted verification code is invalid, expired, or no longer authorized.',
    );
  }

  return updatedSettings;
}
