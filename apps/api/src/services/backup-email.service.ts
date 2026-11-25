
import {
  and,
  eq,
  isNull,
} from 'drizzle-orm';

import {
  db,
  adminEmails,
  adminSecuritySettings,
  adminEmailVerifications,
} from '@yatin-portfolio/database';

import { ApiError } from '../lib/errors/api-error.js';
import {
  encryptBackupEmail,
  decryptBackupEmail,
} from './backup-email-crypto.service.js';

import {
  logAdminAudit,
} from './admin-audit.service.js';
import {
  createAndSendOtp,
  verifyOtpAndRun,
  verifySensitiveActionIfRequired,
} from './otp.service.js';

function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');

  if (!localPart || !domain) {
    return '***';
  }

  const visible = localPart.length > 2
    ? localPart.slice(0, 2)
    : localPart.slice(0, 1);

  return `${visible}***@${domain}`;
}

export async function getBackupEmailStatus(adminUserId: string) {
  const [settings] = await db
    .select({
      backupEmailEncrypted:
        adminSecuritySettings.backupEmailEncrypted,
      backupEmailVerifiedAt:
        adminSecuritySettings.backupEmailVerifiedAt,
    })
    .from(adminSecuritySettings)
    .where(
      eq(adminSecuritySettings.adminUserId, adminUserId),
    )
    .limit(1);

  if (!settings) {
    throw new Error('Admin security settings not found.');
  }

  const email = settings.backupEmailEncrypted
    ? decryptBackupEmail(settings.backupEmailEncrypted)
    : null;

  return {
    configured: Boolean(email),
    verified: Boolean(
      settings.backupEmailEncrypted &&
      settings.backupEmailVerifiedAt,
    ),
    maskedEmail: email ? maskEmail(email) : null,
    verifiedAt: settings.backupEmailVerifiedAt,
  };
}

export async function addBackupEmail(
  adminUserId: string,
  authenticatedEmailId: string,
  expectedPasswordHash: string,
  email: string,
  verificationCode: string | undefined,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const encryptedEmail = encryptBackupEmail(normalizedEmail);

  await db.transaction(async (tx) => {
    const authorized = await verifySensitiveActionIfRequired(
      tx,
      adminUserId,
      verificationCode,
    );

    if (!authorized) {
      throw new ApiError(
        401,
        'TRUSTED_VERIFICATION_FAILED',
        'The trusted verification code is invalid, expired, or required.',
      );
    }

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

    if (!authenticatedEmail) {
      throw new ApiError(
        401,
        'REAUTHENTICATION_FAILED',
        'The authenticated login email is unavailable.',
      );
    }

    const [settings] = await tx
      .select({
        id: adminSecuritySettings.id,
        backupEmailEncrypted:
          adminSecuritySettings.backupEmailEncrypted,
      })
      .from(adminSecuritySettings)
      .where(
        eq(adminSecuritySettings.adminUserId, adminUserId),
      )
      .for('update')
      .limit(1);

    if (!settings) {
      throw new ApiError(
        404,
        'SECURITY_SETTINGS_NOT_FOUND',
        'Administrator security settings were not found.',
      );
    }

    if (settings.backupEmailEncrypted) {
      throw new ApiError(
        409,
        'BACKUP_EMAIL_ALREADY_CONFIGURED',
        'A backup email is already configured. Remove it before adding another.',
      );
    }

    await tx
      .update(adminSecuritySettings)
      .set({
        backupEmailEncrypted: encryptedEmail,
        backupEmailVerifiedAt: null,
        updatedAt: new Date(),
      })
      .where(
        eq(adminSecuritySettings.id, settings.id),
      );

    await logAdminAudit({
      adminId: adminUserId,
      action: 'admin.backup_email.added',
      entityType: 'admin_security_settings',
      entityId: settings.id,
      description: 'Administrator configured a pending backup email.',
      ipAddress,
      userAgent,
    }, tx);
  });

  try {
    await createAndSendOtp({
      adminUserId,
      adminEmailId: null,
      recipientType: 'backup_email',
      purpose: 'backup_email',
      recipientEmail: normalizedEmail,
    });
  } catch (error) {
    await db.transaction(async (tx) => {
      const [settings] = await tx
        .select({ id: adminSecuritySettings.id })
        .from(adminSecuritySettings)
        .where(
          and(
            eq(adminSecuritySettings.adminUserId, adminUserId),
            eq(adminSecuritySettings.backupEmailEncrypted, encryptedEmail),
            isNull(adminSecuritySettings.backupEmailVerifiedAt),
          ),
        )
        .for('update')
        .limit(1);

      if (!settings) return;

      await tx
        .update(adminSecuritySettings)
        .set({
          backupEmailEncrypted: null,
          backupEmailVerifiedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(adminSecuritySettings.id, settings.id));

      await logAdminAudit({
        adminId: adminUserId,
        action: 'admin.backup_email.add_failed',
        entityType: 'admin_security_settings',
        entityId: settings.id,
        description: 'Pending backup email was removed after verification delivery failed.',
        ipAddress,
        userAgent,
      }, tx);
    });

    throw error;
  }
}

/**
 * OTP consumption and backup-email verification are atomic.
 */
export async function verifyBackupEmail(
  adminUserId: string,
  code: string,
): Promise<boolean> {
  return verifyOtpAndRun(
    adminUserId,
    'backup_email',
    code,
    'backup_email',
    null,
    async (tx) => {
      const [settings] = await tx
        .select({
          id: adminSecuritySettings.id,
          backupEmailEncrypted:
            adminSecuritySettings.backupEmailEncrypted,
          backupEmailVerifiedAt:
            adminSecuritySettings.backupEmailVerifiedAt,
        })
        .from(adminSecuritySettings)
        .where(
          eq(adminSecuritySettings.adminUserId, adminUserId),
        )
        .for('update')
        .limit(1);

      if (
        !settings ||
        !settings.backupEmailEncrypted ||
        settings.backupEmailVerifiedAt
      ) {
        return false;
      }

      const [updated] = await tx
        .update(adminSecuritySettings)
        .set({
          backupEmailVerifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(adminSecuritySettings.id, settings.id),
            eq(
              adminSecuritySettings.backupEmailEncrypted,
              settings.backupEmailEncrypted,
            ),
            isNull(
              adminSecuritySettings.backupEmailVerifiedAt,
            ),
          ),
        )
        .returning({ id: adminSecuritySettings.id });

      if (updated) {
        await logAdminAudit({
          adminId: adminUserId,
          action: 'admin.backup_email.verified',
          entityType: 'admin_security_settings',
          entityId: settings.id,
          description: 'Administrator verified a backup email.',
        }, tx);
      }

      return Boolean(updated);
    },
  );
}

export async function removeBackupEmail(
  adminUserId: string,
  authenticatedEmailId: string,
  expectedPasswordHash: string,
  verificationCode: string | undefined,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const authorized = await verifySensitiveActionIfRequired(
      tx,
      adminUserId,
      verificationCode,
    );

    if (!authorized) return false;

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

    if (!authenticatedEmail) {
      return false;
    }

    const [settings] = await tx
      .select({
        id: adminSecuritySettings.id,
        backupEmailEncrypted:
          adminSecuritySettings.backupEmailEncrypted,
      })
      .from(adminSecuritySettings)
      .where(
        eq(adminSecuritySettings.adminUserId, adminUserId),
      )
      .for('update')
      .limit(1);

    if (!settings || !settings.backupEmailEncrypted) {
      return false;
    }

    const now = new Date();

    await tx
      .update(adminEmailVerifications)
      .set({ invalidatedAt: now })
      .where(
        and(
          eq(
            adminEmailVerifications.adminUserId,
            adminUserId,
          ),
          eq(
            adminEmailVerifications.recipientType,
            'backup_email',
          ),
          eq(
            adminEmailVerifications.purpose,
            'backup_email',
          ),
          isNull(adminEmailVerifications.consumedAt),
          isNull(adminEmailVerifications.invalidatedAt),
        ),
      );

    await tx
      .update(adminSecuritySettings)
      .set({
        backupEmailEncrypted: null,
        backupEmailVerifiedAt: null,
        updatedAt: now,
      })
      .where(
        eq(adminSecuritySettings.id, settings.id),
      );

    await logAdminAudit({
      adminId: adminUserId,
      action: 'admin.backup_email.removed',
      entityType: 'admin_security_settings',
      entityId: settings.id,
      description: 'Administrator removed the configured backup email.',
      ipAddress,
      userAgent,
    }, tx);

    return true;
  });
}
