
import {
  createHash,
  randomBytes,
} from 'node:crypto';

import {
  and,
  eq,
  gt,
  isNull,
  sql,
} from 'drizzle-orm';

import {
  db,
  adminEmails,
  adminPasswordResets,
  adminSessions,
} from '@yatin-portfolio/database';

import { env } from '../config/env.js';
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

  const token = randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(token);

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + RESET_EXPIRY_MINUTES * 60 * 1000,
  );

  const [reset] = await db.transaction(async (tx) => {
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

    return tx
      .insert(adminPasswordResets)
      .values({
        adminEmailId: adminEmail.id,
        tokenHash,
        requestedIp,
        expiresAt,
      })
      .returning({
        id: adminPasswordResets.id,
      });
  });

  if (!reset) {
    throw new Error('Failed to create password reset record.');
  }

  try {
    const resetUrl = new URL(env.PASSWORD_RESET_URL);
    resetUrl.searchParams.set('token', token);

    await sendEmail({
      to: adminEmail.email,
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
}

export async function completePasswordReset(
  token: string,
  newPassword: string,
): Promise<boolean> {
  const tokenHash = hashResetToken(token);
  const now = new Date();

  // Hash outside the transaction to avoid holding database locks
  // during the expensive password-hashing operation.
  const newPasswordHash = await hashPassword(newPassword);

  return db.transaction(async (tx) => {
    // Lock the reset record so concurrent requests cannot
    // consume the same reset token simultaneously.
    const [reset] = await tx
      .select({
        id: adminPasswordResets.id,
        adminEmailId: adminPasswordResets.adminEmailId,
      })
      .from(adminPasswordResets)
      .where(
        and(
          eq(adminPasswordResets.tokenHash, tokenHash),
          gt(adminPasswordResets.expiresAt, now),
          isNull(adminPasswordResets.usedAt),
          isNull(adminPasswordResets.invalidatedAt),
        ),
      )
      .for('update')
      .limit(1);

    if (!reset) {
      return false;
    }

    // Lock and revalidate the login email before allowing
    // the password reset.
    const [emailRecord] = await tx
      .select({
        id: adminEmails.id,
      })
      .from(adminEmails)
      .where(
        and(
          eq(adminEmails.id, reset.adminEmailId),
          eq(adminEmails.isVerified, true),
          isNull(adminEmails.removedAt),
        ),
      )
      .for('update')
      .limit(1);

    if (!emailRecord) {
      return false;
    }

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

    // Revoke sessions associated with this login email.
    await tx
      .update(adminSessions)
      .set({
        revokedAt: now,
        revocationReason: 'password_reset',
      })
      .where(
        and(
          eq(adminSessions.adminEmailId, reset.adminEmailId),
          isNull(adminSessions.revokedAt),
        ),
      );

    // Invalidate any other outstanding reset links.
    await tx
      .update(adminPasswordResets)
      .set({ invalidatedAt: now })
      .where(
        and(
          eq(adminPasswordResets.adminEmailId, reset.adminEmailId),
          isNull(adminPasswordResets.usedAt),
          isNull(adminPasswordResets.invalidatedAt),
        ),
      );

    return true;
  });
}
