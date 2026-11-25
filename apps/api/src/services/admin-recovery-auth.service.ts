
import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import {
  and,
  eq,
  isNull,
  sql,
} from 'drizzle-orm';

import {
  db,
  adminEmails,
  adminRecoveryCodes,
  adminSessions,
} from '@yatin-portfolio/database';

import type { SessionMetadata } from './session.service.js';
import { logAdminAudit } from './admin-audit.service.js';

const SESSION_DURATION_DAYS = 7;

function hashRecoveryCode(code: string): string {
  return createHash('sha256')
    .update(code.replace(/-/g, '').toUpperCase())
    .digest('hex');
}

function hashSessionToken(token: string): string {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}

function safeCompare(first: string, second: string): boolean {
  const firstBuffer = Buffer.from(first, 'hex');
  const secondBuffer = Buffer.from(second, 'hex');

  if (
    firstBuffer.length === 0 ||
    firstBuffer.length !== secondBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(firstBuffer, secondBuffer);
}

interface RecoveryInput {
  email: string;
  code: string;
  metadata: SessionMetadata;
}

export async function recoverAdminAccess(input: RecoveryInput) {
  const email = input.email.trim().toLowerCase();
  const code = input.code.trim().toUpperCase();

  if (!/^[A-F0-9]{8}-?[A-F0-9]{8}$/.test(code)) {
    return null;
  }

  const submittedHash = hashRecoveryCode(code);

  const token = randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(token);

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() +
      SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );

  return db.transaction(async (tx) => {
    const [loginEmail] = await tx
      .select({
        id: adminEmails.id,
        adminUserId: adminEmails.adminUserId,
        email: adminEmails.email,
      })
      .from(adminEmails)
      .where(
        and(
          sql`lower(${adminEmails.email}) = ${email}`,
          eq(adminEmails.isVerified, true),
          isNull(adminEmails.removedAt),
        ),
      )
      .for('update')
      .limit(1);

    if (!loginEmail) {
      return null;
    }

    const [recoveryCode] = await tx
      .select({
        id: adminRecoveryCodes.id,
        codeHash: adminRecoveryCodes.codeHash,
      })
      .from(adminRecoveryCodes)
      .where(
        and(
          eq(adminRecoveryCodes.adminUserId, loginEmail.adminUserId),
          eq(adminRecoveryCodes.codeHash, submittedHash),
          isNull(adminRecoveryCodes.usedAt),
        ),
      )
      .for('update')
      .limit(1);

    if (
      !recoveryCode ||
      !safeCompare(submittedHash, recoveryCode.codeHash)
    ) {
      return null;
    }

    const [consumed] = await tx
      .update(adminRecoveryCodes)
      .set({ usedAt: now })
      .where(
        and(
          eq(adminRecoveryCodes.id, recoveryCode.id),
          eq(adminRecoveryCodes.adminUserId, loginEmail.adminUserId),
          isNull(adminRecoveryCodes.usedAt),
        ),
      )
      .returning({
        id: adminRecoveryCodes.id,
      });

    if (!consumed) {
      return null;
    }

    const [session] = await tx
      .insert(adminSessions)
      .values({
        adminEmailId: loginEmail.id,
        tokenHash,
        ipAddress: input.metadata.ipAddress,
        userAgent: input.metadata.userAgent,
        deviceType: input.metadata.deviceType ?? null,
        browser: input.metadata.browser ?? null,
        operatingSystem: input.metadata.operatingSystem ?? null,
        expiresAt,
      })
      .returning({
        id: adminSessions.id,
        createdAt: adminSessions.createdAt,
        expiresAt: adminSessions.expiresAt,
      });

    if (!session) {
      throw new Error('Failed to create recovery session.');
    }

    await logAdminAudit(
      {
        adminId: loginEmail.adminUserId,
        action: 'admin.auth.recovery_code_login',
        entityType: 'admin_session',
        entityId: session.id,
        description:
          'Administrator authenticated using a recovery code.',
        newValues: {
          method: 'recovery_code',
          sessionId: session.id,
        },
        ipAddress: input.metadata.ipAddress,
        userAgent: input.metadata.userAgent,
      },
      tx,
    );

    return {
      token,
      session,
      admin: {
        id: loginEmail.adminUserId,
        email: loginEmail.email,
      },
    };
  });
}
