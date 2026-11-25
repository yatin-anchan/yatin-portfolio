
import {
  and,
  asc,
  eq,
  isNull,
  sql,
} from 'drizzle-orm';

import {
  db,
  adminUsers,
  adminEmails,
} from '@yatin-portfolio/database';

import { ApiError } from '../lib/errors/api-error.js';
import { hashPassword } from './password.service.js';
import { logAdminAudit } from './admin-audit.service.js';

import {
  createAndSendOtp,
  verifyOtpAndRun,
  verifySensitiveActionIfRequired,
} from './otp.service.js';

function hasDatabaseCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

export async function findAdminEmails(adminUserId: string) {
  return db
    .select({
      id: adminEmails.id,
      email: adminEmails.email,
      isPrimary: adminEmails.isPrimary,
      isVerified: adminEmails.isVerified,
      verifiedAt: adminEmails.verifiedAt,
      createdAt: adminEmails.createdAt,
    })
    .from(adminEmails)
    .where(
      and(
        eq(adminEmails.adminUserId, adminUserId),
        isNull(adminEmails.removedAt),
      ),
    )
    .orderBy(
      asc(adminEmails.isPrimary),
      asc(adminEmails.createdAt),
    );
}

export async function addAdminEmail(
  adminUserId: string,
  authenticatedEmailId: string,
  expectedPasswordHash: string,
  trustedEmailId: string,
  email: string,
  password: string,
  trustedCode: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  let createdEmailId: string | null = null;

  let authorized: boolean;

  try {
    authorized = await verifyOtpAndRun(
      adminUserId,
      'sensitive_action',
      trustedCode,
      'login_email',
      trustedEmailId,
      async (tx) => {
        await tx
          .select({ id: adminUsers.id })
          .from(adminUsers)
          .where(eq(adminUsers.id, adminUserId))
          .for('update');

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
          .select({ id: adminEmails.id })
          .from(adminEmails)
          .where(
            sql`lower(${adminEmails.email}) = ${normalizedEmail}`,
          )
          .limit(1);

        if (existing) {
          throw new ApiError(
            409,
            'EMAIL_ALREADY_REGISTERED',
            'This email address is already registered.',
          );
        }

        const [created] = await tx
          .insert(adminEmails)
          .values({
            adminUserId,
            email: normalizedEmail,
            passwordHash,
            isPrimary: false,
            isVerified: false,
          })
          .returning({ id: adminEmails.id });

        if (!created) {
          throw new ApiError(
            500,
            'EMAIL_ADD_FAILED',
            'Unable to add the login email.',
          );
        }

        createdEmailId = created.id;

        await logAdminAudit({
          adminId: adminUserId,
          action: 'admin.login_email.added',
          entityType: 'admin_email',
          entityId: created.id,
          description: 'Administrator added a pending login email.',
          ipAddress,
          userAgent,
        }, tx);

        return true;
      },
    );
  } catch (error) {
    if (hasDatabaseCode(error, '23505')) {
      throw new ApiError(
        409,
        'EMAIL_ALREADY_REGISTERED',
        'This email address is already registered.',
      );
    }

    throw error;
  }

  if (!authorized || !createdEmailId) {
    throw new ApiError(
      401,
      'TRUSTED_VERIFICATION_FAILED',
      'The trusted verification code is invalid, expired, or no longer authorized.',
    );
  }

  const pendingEmailId = createdEmailId;

  try {
    await createAndSendOtp({
      adminUserId,
      adminEmailId: pendingEmailId,
      recipientType: 'login_email',
      purpose: 'add_login_email',
      recipientEmail: normalizedEmail,
    });
  } catch (error) {
    await db.transaction(async (tx) => {
      await tx
        .delete(adminEmails)
        .where(
          and(
            eq(adminEmails.id, pendingEmailId),
            eq(adminEmails.adminUserId, adminUserId),
            eq(adminEmails.isVerified, false),
            eq(adminEmails.isPrimary, false),
          ),
        );

      await logAdminAudit({
        adminId: adminUserId,
        action: 'admin.login_email.add_failed',
        entityType: 'admin_email',
        entityId: pendingEmailId,
        description: 'Pending login email was removed after verification delivery failed.',
        ipAddress,
        userAgent,
      }, tx);
    });

    throw error;
  }
}

/**
 * OTP consumption and email verification are atomic.
 */
export async function verifyAdminEmail(
  adminUserId: string,
  adminEmailId: string,
  code: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<boolean> {
  return verifyOtpAndRun(
    adminUserId,
    'add_login_email',
    code,
    'login_email',
    adminEmailId,
    async (tx) => {
      const [emailRecord] = await tx
        .select({
          id: adminEmails.id,
          isVerified: adminEmails.isVerified,
        })
        .from(adminEmails)
        .where(
          and(
            eq(adminEmails.id, adminEmailId),
            eq(adminEmails.adminUserId, adminUserId),
            isNull(adminEmails.removedAt),
          ),
        )
        .for('update')
        .limit(1);

      if (!emailRecord || emailRecord.isVerified) {
        return false;
      }

      const [updated] = await tx
        .update(adminEmails)
        .set({
          isVerified: true,
          verifiedAt: new Date(),
        })
        .where(
          and(
            eq(adminEmails.id, adminEmailId),
            eq(adminEmails.adminUserId, adminUserId),
            eq(adminEmails.isVerified, false),
            eq(adminEmails.isPrimary, false),
            isNull(adminEmails.removedAt),
          ),
        )
        .returning({ id: adminEmails.id });

      if (updated) {
        await logAdminAudit({
          adminId: adminUserId,
          action: 'admin.login_email.verified',
          entityType: 'admin_email',
          entityId: adminEmailId,
          description: 'Administrator verified a login email.',
          ipAddress,
          userAgent,
        }, tx);
      }

      return Boolean(updated);
    },
  );
}

/**
 * OTP consumption and primary-email change are atomic.
 */
export async function verifyPrimaryAdminEmail(
  adminUserId: string,
  targetEmailId: string,
  trustedEmailId: string,
  code: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<boolean> {
  return verifyOtpAndRun(
    adminUserId,
    'sensitive_action',
    code,
    'login_email',
    trustedEmailId,
    async (tx) => {
      await tx
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.id, adminUserId))
        .for('update');

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

      const [target] = await tx
        .select({
          id: adminEmails.id,
          isPrimary: adminEmails.isPrimary,
        })
        .from(adminEmails)
        .where(
          and(
            eq(adminEmails.id, targetEmailId),
            eq(adminEmails.adminUserId, adminUserId),
            eq(adminEmails.isVerified, true),
            isNull(adminEmails.removedAt),
          ),
        )
        .for('update')
        .limit(1);

      if (!trustedEmail || !target) {
        return false;
      }

      if (target.isPrimary) {
        return true;
      }

      await tx
        .update(adminEmails)
        .set({ isPrimary: false })
        .where(
          and(
            eq(adminEmails.adminUserId, adminUserId),
            eq(adminEmails.isPrimary, true),
            isNull(adminEmails.removedAt),
          ),
        );

      const [updated] = await tx
        .update(adminEmails)
        .set({ isPrimary: true })
        .where(
          and(
            eq(adminEmails.id, targetEmailId),
            eq(adminEmails.adminUserId, adminUserId),
            eq(adminEmails.isVerified, true),
            isNull(adminEmails.removedAt),
          ),
        )
        .returning({ id: adminEmails.id });

      if (updated) {
        await logAdminAudit({
          adminId: adminUserId,
          action: 'admin.login_email.primary_changed',
          entityType: 'admin_email',
          entityId: targetEmailId,
          description: 'Administrator changed the primary login email.',
          ipAddress,
          userAgent,
        }, tx);
      }

      return Boolean(updated);
    },
  );
}

export async function removeAdminEmail(
  adminUserId: string,
  adminEmailId: string,
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

    if (!authorized) {
      return false;
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

    if (
      !authenticatedEmail ||
      adminEmailId === authenticatedEmailId
    ) {
      return false;
    }

    const [target] = await tx
      .select({
        id: adminEmails.id,
        isPrimary: adminEmails.isPrimary,
      })
      .from(adminEmails)
      .where(
        and(
          eq(adminEmails.id, adminEmailId),
          eq(adminEmails.adminUserId, adminUserId),
          isNull(adminEmails.removedAt),
        ),
      )
      .for('update')
      .limit(1);

    if (!target || target.isPrimary) {
      return false;
    }

    const [removed] = await tx
      .update(adminEmails)
      .set({
        removedAt: new Date(),
        isPrimary: false,
      })
      .where(
        and(
          eq(adminEmails.id, adminEmailId),
          eq(adminEmails.adminUserId, adminUserId),
          eq(adminEmails.isPrimary, false),
          isNull(adminEmails.removedAt),
        ),
      )
      .returning({ id: adminEmails.id });

    if (!removed) {
      return false;
    }

    await logAdminAudit({
      adminId: adminUserId,
      action: 'admin.login_email.removed',
      entityType: 'admin_email',
      entityId: adminEmailId,
      description: 'Administrator removed a login email.',
      ipAddress,
      userAgent,
    }, tx);

    return true;
  });
}
