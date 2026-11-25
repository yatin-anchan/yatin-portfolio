
import {
  and,
  eq,
  isNull,
} from 'drizzle-orm';

import {
  db,
  adminEmails,
} from '@yatin-portfolio/database';

import { verifyPassword } from './password.service.js';

/**
 * Verifies the password belonging to the currently authenticated
 * login email. Returns its current hash for transactional rechecking.
 */
export async function reauthenticateAdmin(
  adminUserId: string,
  adminEmailId: string,
  currentPassword: string,
): Promise<string | null> {
  const [emailRecord] = await db
    .select({
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
    .limit(1);

  if (!emailRecord) {
    return null;
  }

  const valid = await verifyPassword(
    emailRecord.passwordHash,
    currentPassword,
  );

  return valid ? emailRecord.passwordHash : null;
}
