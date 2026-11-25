
import {
  and,
  asc,
  eq,
  isNull,
  sql,
} from 'drizzle-orm';

import {
  db,
  adminEmails,
} from '@yatin-portfolio/database';

import { hashPassword } from './password.service.js';

import {
  createAndSendOtp,
  verifyOtpAndRun,
} from './otp.service.js';

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
  email: string,
  password: string,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);

  const created = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: adminEmails.id })
      .from(adminEmails)
      .where(
        sql`lower(${adminEmails.email}) = ${normalizedEmail}`,
      )
      .limit(1);

    if (existing) {
      throw new Error('This email address is already registered.');
    }

    const [result] = await tx
      .insert(adminEmails)
      .values({
        adminUserId,
        email: normalizedEmail,
        passwordHash,
        isPrimary: false,
        isVerified: false,
      })
      .returning({ id: adminEmails.id });

    if (!result) {
      throw new Error('Failed to add login email.');
    }

    return result;
  });

  try {
    await createAndSendOtp({
      adminUserId,
      adminEmailId: created.id,
      recipientType: 'login_email',
      purpose: 'add_login_email',
      recipientEmail: normalizedEmail,
    });
  } catch (error) {
    await db
      .delete(adminEmails)
      .where(
        and(
          eq(adminEmails.id, created.id),
          eq(adminEmails.adminUserId, adminUserId),
          eq(adminEmails.isVerified, false),
          eq(adminEmails.isPrimary, false),
        ),
      );

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

      return Boolean(updated);
    },
  );
}

/**
 * OTP consumption and primary-email change are atomic.
 */
export async function verifyPrimaryAdminEmail(
  adminUserId: string,
  adminEmailId: string,
  code: string,
): Promise<boolean> {
  return verifyOtpAndRun(
    adminUserId,
    'change_primary_email',
    code,
    'login_email',
    adminEmailId,
    async (tx) => {
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
            eq(adminEmails.isVerified, true),
            isNull(adminEmails.removedAt),
          ),
        )
        .for('update')
        .limit(1);

      if (!target) {
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
            eq(adminEmails.id, adminEmailId),
            eq(adminEmails.adminUserId, adminUserId),
            eq(adminEmails.isVerified, true),
            isNull(adminEmails.removedAt),
          ),
        )
        .returning({ id: adminEmails.id });

      return Boolean(updated);
    },
  );
}

export async function removeAdminEmail(
  adminUserId: string,
  adminEmailId: string,
  authenticatedEmailId: string,
  expectedPasswordHash: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
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

    return Boolean(removed);
  });
}
