
import {
  createHash,
  randomBytes,
} from 'node:crypto';

import {
  and,
  eq,
  gt,
  inArray,
  isNull,
  sql,
} from 'drizzle-orm';

import {
  db,
  adminUsers,
  adminEmails,
  adminSecuritySettings,
  adminPasswordResets,
  adminSessions,
} from '@yatin-portfolio/database';

import { env } from '../config/env.js';
import { logAdminAudit } from './admin-audit.service.js';
import { notifyAdminSecurityEvent } from './admin-security-settings.service.js';
import {
  createAndSendOtp,
  verifyOtpInTransaction,
} from './otp.service.js';
import { sendEmail } from './email.service.js';
import { hashPassword } from './password.service.js';

const RESET_EXPIRY_MINUTES = 30;

function hashResetToken(token: string): string {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}

export async function requestPasswordReset(
  email: string,
  requestedIp: string | null,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  const [adminEmail] = await db
    .select({
      id: adminEmails.id,
      adminUserId: adminEmails.adminUserId,
      email: adminEmails.email,
    })
    .from(adminEmails)
    .where(
      and(
        sql`lower(${adminEmails.email}) = ${normalizedEmail}`,
        eq(adminEmails.isVerified, true),
        isNull(adminEmails.removedAt),
      ),
    )
    .limit(1);

  // Keep the public response generic to avoid account enumeration.
  if (!adminEmail) return;

  const [securitySettings] = await db
    .select({
      adminUserId: adminSecuritySettings.adminUserId,
      requireDualVerification:
        adminSecuritySettings.requireDualVerification,
    })
    .from(adminSecuritySettings)
    .innerJoin(
      adminEmails,
      eq(adminSecuritySettings.adminUserId, adminEmails.adminUserId),
    )
    .where(eq(adminEmails.id, adminEmail.id))
    .limit(1);

  if (!securitySettings) return;

  if (securitySettings?.requireDualVerification) {
    const [trustedEmail] = await db
      .select({
        id: adminEmails.id,
        email: adminEmails.email,
      })
      .from(adminEmails)
      .where(
        and(
          eq(adminEmails.adminUserId, securitySettings.adminUserId),
          eq(adminEmails.isPrimary, true),
          eq(adminEmails.isVerified, true),
          isNull(adminEmails.removedAt),
        ),
      )
      .limit(1);

    if (!trustedEmail) return;
  }

  const token = randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(token);

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + RESET_EXPIRY_MINUTES * 60 * 1000,
  );

  const reset = await db.transaction(async (tx) => {
    const [adminUser] = await tx
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(eq(adminUsers.id, adminEmail.adminUserId))
      .for('update')
      .limit(1);

    if (!adminUser) return null;

    const [activeEmail] = await tx
      .select({
        id: adminEmails.id,
        email: adminEmails.email,
      })
      .from(adminEmails)
      .where(
        and(
          eq(adminEmails.id, adminEmail.id),
          eq(adminEmails.adminUserId, adminEmail.adminUserId),
          eq(adminEmails.isVerified, true),
          isNull(adminEmails.removedAt),
        ),
      )
      .for('update')
      .limit(1);

    if (!activeEmail) return null;

    await tx
      .update(adminPasswordResets)
      .set({ invalidatedAt: now })
      .where(
        and(
          eq(adminPasswordResets.adminEmailId, adminEmail.id),
          isNull(adminPasswordResets.usedAt),
          isNull(adminPasswordResets.invalidatedAt),
        ),
      );

    const [created] = await tx
      .insert(adminPasswordResets)
      .values({
        adminEmailId: activeEmail.id,
        tokenHash,
        requestedIp,
        expiresAt,
      })
      .returning({
        id: adminPasswordResets.id,
      });

    if (!created) {
      throw new Error('Failed to create password reset record.');
    }

    return {
      ...created,
      email: activeEmail.email,
    };
  });

  if (!reset) {
    return;
  }

  let resetEmailDelivered = false;

  try {
    const resetUrl = new URL(env.PASSWORD_RESET_URL);
    resetUrl.searchParams.set('token', token);

    await sendEmail({
      to: reset.email,
      subject: 'Reset your admin password',
      text: [
        'A password reset was requested for your admin account.',
        '',
        `Use this link to reset your password: ${resetUrl.toString()}`,
        '',
        `This link expires in ${RESET_EXPIRY_MINUTES} minutes.`,
        'If you did not request this, you can ignore this email.',
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif">
          <h2>Password reset</h2>
          <p>A password reset was requested for your admin account.</p>
          <p>
            <a href="${resetUrl.toString()}">Reset your password</a>
          </p>
          <p>This link expires in ${RESET_EXPIRY_MINUTES} minutes.</p>
          <p>If you did not request this, ignore this email.</p>
        </div>
      `,
    });
    resetEmailDelivered = true;
  } catch {
    await db
      .update(adminPasswordResets)
      .set({ invalidatedAt: new Date() })
      .where(
        and(
          eq(adminPasswordResets.id, reset.id),
          isNull(adminPasswordResets.usedAt),
          isNull(adminPasswordResets.invalidatedAt),
        ),
      );

    // Do not log the reset token or recipient details.
    console.error('Password reset email delivery failed.');
  }

  if (!resetEmailDelivered) return;

  if (securitySettings?.requireDualVerification) {
    const [trustedEmail] = await db
      .select({
        id: adminEmails.id,
        email: adminEmails.email,
      })
      .from(adminEmails)
      .where(
        and(
          eq(adminEmails.adminUserId, securitySettings.adminUserId),
          eq(adminEmails.isPrimary, true),
          eq(adminEmails.isVerified, true),
          isNull(adminEmails.removedAt),
        ),
      )
      .limit(1);

    if (trustedEmail) {
      try {
        await createAndSendOtp({
          adminUserId: securitySettings.adminUserId,
          adminEmailId: trustedEmail.id,
          recipientType: 'login_email',
          purpose: 'sensitive_action',
          recipientEmail: trustedEmail.email,
        });
      } catch {
        await db
          .update(adminPasswordResets)
          .set({ invalidatedAt: new Date() })
          .where(
            and(
              eq(adminPasswordResets.id, reset.id),
              isNull(adminPasswordResets.usedAt),
              isNull(adminPasswordResets.invalidatedAt),
            ),
          );
        console.error('Password reset verification delivery failed.');
      }
    }
  }
}

export async function completePasswordReset(
  token: string,
  newPassword: string,
  verificationCode?: string,
): Promise<boolean> {
  const tokenHash = hashResetToken(token);
  const now = new Date();

  // Hash outside the transaction to avoid holding database locks
  // during the expensive password-hashing operation.
  const newPasswordHash = await hashPassword(newPassword);

  const [candidate] = await db
    .select({
      id: adminPasswordResets.id,
      adminEmailId: adminPasswordResets.adminEmailId,
      adminUserId: adminEmails.adminUserId,
    })
    .from(adminPasswordResets)
    .innerJoin(
      adminEmails,
      eq(adminPasswordResets.adminEmailId, adminEmails.id),
    )
    .where(
      and(
        eq(adminPasswordResets.tokenHash, tokenHash),
        gt(adminPasswordResets.expiresAt, now),
        isNull(adminPasswordResets.usedAt),
        isNull(adminPasswordResets.invalidatedAt),
        eq(adminEmails.isVerified, true),
        isNull(adminEmails.removedAt),
      ),
    )
    .limit(1);

  if (!candidate) return false;

  const result = await db.transaction(async (tx) => {
    const [adminUser] = await tx
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(eq(adminUsers.id, candidate.adminUserId))
      .for('update')
      .limit(1);

    if (!adminUser) {
      return false;
    }

    const [securitySettings] = await tx
      .select({
        requireDualVerification:
          adminSecuritySettings.requireDualVerification,
      })
      .from(adminSecuritySettings)
      .where(
        eq(
          adminSecuritySettings.adminUserId,
          candidate.adminUserId,
        ),
      )
      .for('update')
      .limit(1);

    if (!securitySettings) {
      return false;
    }

    if (securitySettings.requireDualVerification) {
      if (!verificationCode) return false;

      const [trustedEmail] = await tx
        .select({ id: adminEmails.id })
        .from(adminEmails)
        .where(
          and(
            eq(adminEmails.adminUserId, candidate.adminUserId),
            eq(adminEmails.isPrimary, true),
            eq(adminEmails.isVerified, true),
            isNull(adminEmails.removedAt),
          ),
        )
        .for('update')
        .limit(1);

      if (
        !trustedEmail ||
        !(await verifyOtpInTransaction(
          tx,
          candidate.adminUserId,
          'sensitive_action',
          verificationCode,
          'login_email',
          trustedEmail.id,
        ))
      ) {
        return false;
      }
    }

    const [reset] = await tx
      .select({
        id: adminPasswordResets.id,
        adminEmailId: adminPasswordResets.adminEmailId,
        requestedIp: adminPasswordResets.requestedIp,
      })
      .from(adminPasswordResets)
      .where(
        and(
          eq(adminPasswordResets.id, candidate.id),
          eq(adminPasswordResets.tokenHash, tokenHash),
          gt(adminPasswordResets.expiresAt, now),
          isNull(adminPasswordResets.usedAt),
          isNull(adminPasswordResets.invalidatedAt),
        ),
      )
      .for('update')
      .limit(1);

    if (!reset) return false;

    const [emailRecord] = await tx
      .select({
        id: adminEmails.id,
        adminUserId: adminEmails.adminUserId,
        email: adminEmails.email,
      })
      .from(adminEmails)
      .where(
        and(
          eq(adminEmails.id, reset.adminEmailId),
          eq(adminEmails.adminUserId, candidate.adminUserId),
          eq(adminEmails.isVerified, true),
          isNull(adminEmails.removedAt),
        ),
      )
      .for('update')
      .limit(1);

    if (!emailRecord) return false;

    const emailRecords = await tx
      .select({ id: adminEmails.id })
      .from(adminEmails)
      .where(eq(adminEmails.adminUserId, emailRecord.adminUserId))
      .for('update');
    const allEmailIds = emailRecords.map((email) => email.id);

    // Consume the reset token.
    const [consumed] = await tx
      .update(adminPasswordResets)
      .set({ usedAt: now })
      .where(
        and(
          eq(adminPasswordResets.id, reset.id),
          isNull(adminPasswordResets.usedAt),
          isNull(adminPasswordResets.invalidatedAt),
          gt(adminPasswordResets.expiresAt, now),
        ),
      )
      .returning({
        id: adminPasswordResets.id,
      });

    if (!consumed) {
      return false;
    }

    // Update only an email that is still active and verified.
    const [updatedEmail] = await tx
      .update(adminEmails)
      .set({
        passwordHash: newPasswordHash,
      })
      .where(
        and(
          eq(adminEmails.id, reset.adminEmailId),
          eq(adminEmails.isVerified, true),
          isNull(adminEmails.removedAt),
        ),
      )
      .returning({
        id: adminEmails.id,
      });

    if (!updatedEmail) {
      // Returning false rolls back token consumption too.
      return false;
    }

    if (allEmailIds.length > 0) {
      await tx
        .update(adminSessions)
        .set({
          revokedAt: now,
          revocationReason: 'password_reset',
        })
        .where(
          and(
            inArray(adminSessions.adminEmailId, allEmailIds),
            isNull(adminSessions.revokedAt),
          ),
        );

      await tx
        .update(adminPasswordResets)
        .set({ invalidatedAt: now })
        .where(
          and(
            inArray(adminPasswordResets.adminEmailId, allEmailIds),
            isNull(adminPasswordResets.usedAt),
            isNull(adminPasswordResets.invalidatedAt),
          ),
        );
    }

    await logAdminAudit({
      adminId: emailRecord.adminUserId,
      action: 'admin.password_reset',
      entityType: 'admin_email',
      entityId: reset.adminEmailId,
      description: 'Administrator password was reset; all active sessions were revoked.',
      ipAddress: reset.requestedIp,
      userAgent: null,
    }, tx);

    return {
      adminUserId: emailRecord.adminUserId,
      email: emailRecord.email,
    };
  });

  if (!result) return false;

  void notifyAdminSecurityEvent(
    result.adminUserId,
    result.email,
    'The administrator password was reset and all active sessions were revoked.',
  );

  return true;
}
