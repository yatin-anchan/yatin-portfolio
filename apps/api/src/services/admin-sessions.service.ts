
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  ne,
} from 'drizzle-orm';

import {
  db,
  adminEmails,
  adminSessions,
} from '@yatin-portfolio/database';

import { logAdminAudit } from './admin-audit.service.js';

interface SessionActionMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

export async function listAdminSessions(
  adminUserId: string,
  currentSessionId: string,
) {
  const sessions = await db
    .select({
      id: adminSessions.id,
      email: adminEmails.email,
      ipAddress: adminSessions.ipAddress,
      userAgent: adminSessions.userAgent,
      deviceType: adminSessions.deviceType,
      browser: adminSessions.browser,
      operatingSystem: adminSessions.operatingSystem,
      location: adminSessions.location,
      createdAt: adminSessions.createdAt,
      lastSeenAt: adminSessions.lastSeenAt,
      expiresAt: adminSessions.expiresAt,
    })
    .from(adminSessions)
    .innerJoin(
      adminEmails,
      eq(adminSessions.adminEmailId, adminEmails.id),
    )
    .where(
      and(
        eq(adminEmails.adminUserId, adminUserId),
        eq(adminEmails.isVerified, true),
        isNull(adminEmails.removedAt),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(adminSessions.lastSeenAt));

  return sessions.map((session) => ({
    ...session,
    isCurrent: session.id === currentSessionId,
  }));
}

export async function revokeAdminSessionById(
  adminUserId: string,
  sessionId: string,
  currentSessionId: string,
  metadata: SessionActionMetadata,
): Promise<boolean> {
  // Never allow this endpoint to revoke its own session.
  if (sessionId === currentSessionId) {
    return false;
  }

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({
        id: adminSessions.id,
      })
      .from(adminSessions)
      .innerJoin(
        adminEmails,
        eq(adminSessions.adminEmailId, adminEmails.id),
      )
      .where(
        and(
          eq(adminSessions.id, sessionId),
          eq(adminEmails.adminUserId, adminUserId),
          eq(adminEmails.isVerified, true),
          isNull(adminEmails.removedAt),
          isNull(adminSessions.revokedAt),
          gt(adminSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!session) {
      return false;
    }

    const [revoked] = await tx
      .update(adminSessions)
      .set({
        revokedAt: new Date(),
        revocationReason: 'admin_revoked',
      })
      .where(
        and(
          eq(adminSessions.id, sessionId),
          isNull(adminSessions.revokedAt),
        ),
      )
      .returning({
        id: adminSessions.id,
      });

    if (!revoked) {
      return false;
    }

    await logAdminAudit(
      {
        adminId: adminUserId,
        action: 'admin.session_revoked',
        entityType: 'admin_session',
        entityId: sessionId,
        description: 'Administrator revoked a login session.',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
      tx,
    );

    return true;
  });
}

export async function revokeOtherAdminSessions(
  adminUserId: string,
  currentSessionId: string,
  metadata: SessionActionMetadata,
): Promise<number> {
  return db.transaction(async (tx) => {
    const now = new Date();

    const sessions = await tx
      .select({
        id: adminSessions.id,
      })
      .from(adminSessions)
      .innerJoin(
        adminEmails,
        eq(adminSessions.adminEmailId, adminEmails.id),
      )
      .where(
        and(
          eq(adminEmails.adminUserId, adminUserId),
          eq(adminEmails.isVerified, true),
          isNull(adminEmails.removedAt),
          isNull(adminSessions.revokedAt),
          gt(adminSessions.expiresAt, now),
          ne(adminSessions.id, currentSessionId),
        ),
      );

    const sessionIds = sessions.map((session) => session.id);

    if (sessionIds.length === 0) {
      return 0;
    }

    const revoked = await tx
      .update(adminSessions)
      .set({
        revokedAt: new Date(),
        revocationReason: 'admin_revoked_others',
      })
      .where(
        and(
          inArray(adminSessions.id, sessionIds),
          isNull(adminSessions.revokedAt),
        ),
      )
      .returning({
        id: adminSessions.id,
      });

    await logAdminAudit(
      {
        adminId: adminUserId,
        action: 'admin.other_sessions_revoked',
        entityType: 'admin_session',
        description: 'Administrator revoked all other active sessions.',
        oldValues: {
          activeOtherSessions: sessionIds.length,
        },
        newValues: {
          revokedSessions: revoked.length,
        },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
      tx,
    );

    return revoked.length;
  });
}
