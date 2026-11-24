import { and, eq, isNull, sql } from 'drizzle-orm';

import {
  db,
  adminEmails,
} from '@yatin-portfolio/database';

export interface AdminLoginCredential {
  id: string;
  adminUserId: string;
  email: string;
  passwordHash: string;
}

export async function findAdminLoginCredential(
  email: string,
): Promise<AdminLoginCredential | null> {
  const [admin] = await db
    .select({
      id: adminEmails.id,
      adminUserId: adminEmails.adminUserId,
      email: adminEmails.email,
      passwordHash: adminEmails.passwordHash,
    })
    .from(adminEmails)
    .where(
      and(
        sql`lower(${adminEmails.email}) = ${email.toLowerCase()}`,
        eq(adminEmails.isVerified, true),
        isNull(adminEmails.removedAt),
      ),
    )
    .limit(1);

  return admin ?? null;
}