
import {
  createHash,
  randomBytes,
} from 'node:crypto';

import {
  and,
  eq,
  gt,
  isNull,
} from 'drizzle-orm';

import {
  db,
  adminEmails,
  adminSessions,
} from '@yatin-portfolio/database';

const SESSION_DURATION_DAYS = 7;

export interface SessionMetadata {
  ipAddress: string | null;
  userAgent: string | null;
  deviceType?: string | null;
  browser?: string | null;
  operatingSystem?: string | null;
}

function hashSessionToken(token: string): string {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}

export async function createAdminSession(
  adminEmailId: string,
  metadata: SessionMetadata,
) {
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(token);

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() +
      SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );

  const [session] = await db
    .insert(adminSessions)
    .values({
      adminEmailId,
      tokenHash,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      deviceType: metadata.deviceType ?? null,
      browser: metadata.browser ?? null,
      operatingSystem: metadata.operatingSystem ?? null,
      expiresAt,
    })
    .returning({
      id: adminSessions.id,
      createdAt: adminSessions.createdAt,
      expiresAt: adminSessions.expiresAt,
    });

  return {
    token,
    session,
  };
}

export async function findActiveAdminSession(token: string) {
  const tokenHash = hashSessionToken(token);
  const now = new Date();

  const [result] = await db
    .select({
      sessionId: adminSessions.id,
      adminEmailId: adminEmails.id,
      adminUserId: adminEmails.adminUserId,
      email: adminEmails.email,
      isPrimary: adminEmails.isPrimary,
      isVerified: adminEmails.isVerified,
      createdAt: adminSessions.createdAt,
      expiresAt: adminSessions.expiresAt,
    })
    .from(adminSessions)
    .innerJoin(
      adminEmails,
      eq(adminSessions.adminEmailId, adminEmails.id),
    )
    .where(
      and(
        eq(adminSessions.tokenHash, tokenHash),
        isNull(adminSessions.revokedAt),
        isNull(adminEmails.removedAt),
        eq(adminEmails.isVerified, true),
        gt(adminSessions.expiresAt, now),
      ),
    )
    .limit(1);

  if (!result) {
    return null;
  }

  await db
    .update(adminSessions)
    .set({ lastSeenAt: now })
    .where(
      and(
        eq(adminSessions.id, result.sessionId),
        isNull(adminSessions.revokedAt),
      ),
    );

  return result;
}

export async function revokeAdminSession(
  token: string,
  reason = 'user_logout',
): Promise<boolean> {
  const tokenHash = hashSessionToken(token);

  const [revoked] = await db
    .update(adminSessions)
    .set({
      revokedAt: new Date(),
      revocationReason: reason,
    })
    .where(
      and(
        eq(adminSessions.tokenHash, tokenHash),
        isNull(adminSessions.revokedAt),
      ),
    )
    .returning({
      id: adminSessions.id,
    });

  return Boolean(revoked);
}
