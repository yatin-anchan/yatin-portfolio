
import { createHash, randomBytes } from 'node:crypto';

import {
  and,
  eq,
  isNull,
} from 'drizzle-orm';

import {
  db,
  adminEmails,
  adminRecoveryCodes,
} from '@yatin-portfolio/database';

import { reauthenticateAdmin } from './admin-reauth.service.js';
import { logAdminAudit } from './admin-audit.service.js';
import { verifySensitiveActionIfRequired } from './otp.service.js';
import type { SessionMetadata } from './session.service.js';

const RECOVERY_CODE_COUNT = 10;

function generateRecoveryCode(): string {
  const value = randomBytes(8).toString('hex').toUpperCase();

  return `${value.slice(0, 8)}-${value.slice(8, 16)}`;
}

function hashRecoveryCode(code: string): string {
  const normalized = code
    .replace(/-/g, '')
    .toUpperCase();

  return createHash('sha256')
    .update(normalized)
    .digest('hex');
}

/**
 * Regenerates recovery codes after verifying the administrator's
 * current password.
 *
 * Existing recovery codes are replaced atomically.
 * Plaintext codes are returned only once.
 */
export async function regenerateRecoveryCodesForAdmin(
  adminUserId: string,
  adminEmailId: string,
  currentPassword: string,
  verificationCode: string | undefined,
  metadata: SessionMetadata,
): Promise<string[] | null> {
  const expectedPasswordHash = await reauthenticateAdmin(
    adminUserId,
    adminEmailId,
    currentPassword,
  );

  if (!expectedPasswordHash) {
    return null;
  }

  const codes = Array.from(
    { length: RECOVERY_CODE_COUNT },
    generateRecoveryCode,
  );

  const records = codes.map((code) => ({
    adminUserId,
    codeHash: hashRecoveryCode(code),
  }));

  return db.transaction(async (tx) => {
    const authorized = await verifySensitiveActionIfRequired(
      tx,
      adminUserId,
      verificationCode,
    );

    if (!authorized) {
      return null;
    }

    // Lock the authenticated email and ensure its password
    // has not changed since reauthentication.
    const [emailRecord] = await tx
      .select({
        id: adminEmails.id,
        passwordHash: adminEmails.passwordHash,
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

    if (
      !emailRecord ||
      emailRecord.passwordHash !== expectedPasswordHash
    ) {
      return null;
    }

    // Remove the previous recovery codes.
    await tx
      .delete(adminRecoveryCodes)
      .where(
        eq(adminRecoveryCodes.adminUserId, adminUserId),
      );

    // Store only hashes of the newly generated codes.
    await tx
      .insert(adminRecoveryCodes)
      .values(records);

    // Keep the audit record in the same transaction.
    await logAdminAudit(
      {
        adminId: adminUserId,
        action: 'admin.recovery_codes.regenerated',
        entityType: 'admin_recovery_codes',
        entityId: null,
        description: 'Administrator regenerated recovery codes.',
        newValues: {
          count: codes.length,
        },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
      tx,
    );

    return codes;
  });
}

/**
 * Returns the number of unused recovery codes.
 */
export async function countUnusedRecoveryCodes(
  adminUserId: string,
): Promise<number> {
  const records = await db
    .select({
      id: adminRecoveryCodes.id,
    })
    .from(adminRecoveryCodes)
    .where(
      and(
        eq(adminRecoveryCodes.adminUserId, adminUserId),
        isNull(adminRecoveryCodes.usedAt),
      ),
    );

  return records.length;
}
