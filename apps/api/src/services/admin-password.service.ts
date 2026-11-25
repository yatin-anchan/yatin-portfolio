
import {
  and,
  eq,
  inArray,
  isNull,
  ne,
} from 'drizzle-orm';

import {
  db,
  adminEmails,
  adminSessions,
} from '@yatin-portfolio/database';

import {
  hashPassword,
  verifyPassword,
} from './password.service.js';

import { logAdminAudit } from './admin-audit.service.js';

interface ChangePasswordInput {
  adminId: string;
  emailId: string;
  currentSessionId: string;
  currentPassword: string;
  newPassword: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export async function changeAdminPassword(
  input: ChangePasswordInput,
): Promise<boolean> {
  if (input.currentPassword === input.newPassword) {
    return false;
  }

  const [emailRecord] = await db
    .select({
      id: adminEmails.id,
      passwordHash: adminEmails.passwordHash,
    })
    .from(adminEmails)
    .where(
      and(
        eq(adminEmails.id, input.emailId),
        eq(adminEmails.adminUserId, input.adminId),
        eq(adminEmails.isVerified, true),
        isNull(adminEmails.removedAt),
      ),
    )
    .limit(1);

  if (!emailRecord) {
    return false;
  }

  const passwordIsValid = await verifyPassword(
    emailRecord.passwordHash,
    input.currentPassword,
  );

  if (!passwordIsValid) {
    return false;
  }

  const newPasswordHash = await hashPassword(
    input.newPassword,
  );

  return db.transaction(async (tx) => {
    const [updatedEmail] = await tx
      .update(adminEmails)
      .set({
        passwordHash: newPasswordHash,
      })
      .where(
        and(
          eq(adminEmails.id, input.emailId),
          eq(adminEmails.adminUserId, input.adminId),
          eq(adminEmails.passwordHash, emailRecord.passwordHash),
          eq(adminEmails.isVerified, true),
          isNull(adminEmails.removedAt),
        ),
      )
      .returning({
        id: adminEmails.id,
      });

    if (!updatedEmail) {
      return false;
    }

    const emailRecords = await tx
      .select({
        id: adminEmails.id,
      })
      .from(adminEmails)
      .where(
        and(
          eq(adminEmails.adminUserId, input.adminId),
          isNull(adminEmails.removedAt),
        ),
      );

    const emailIds = emailRecords.map((email) => email.id);

    if (emailIds.length > 0) {
      await tx
        .update(adminSessions)
        .set({
          revokedAt: new Date(),
          revocationReason: 'password_changed',
        })
        .where(
          and(
            inArray(adminSessions.adminEmailId, emailIds),
            ne(adminSessions.id, input.currentSessionId),
            isNull(adminSessions.revokedAt),
          ),
        );
    }

    await logAdminAudit(
      {
        adminId: input.adminId,
        action: 'admin.password_changed',
        entityType: 'admin_email',
        entityId: input.emailId,
        description:
          'Administrator changed the password for a login email.',
        oldValues: {
          passwordChanged: false,
        },
        newValues: {
          passwordChanged: true,
          otherSessionsRevoked: true,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
      tx,
    );

    return true;
  });
}
