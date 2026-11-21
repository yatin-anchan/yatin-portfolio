
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm';
import { adminUsers } from './admin-users.js';

export const adminSecuritySettings = pgTable(
  'admin_security_settings',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, {
        onDelete: 'cascade',
      }),

    backupEmailEncrypted: text('backup_email_encrypted'),

    backupEmailVerifiedAt: timestamp('backup_email_verified_at', {
      withTimezone: true,
      mode: 'date',
    }),

    requireDualVerification: boolean('require_dual_verification')
      .notNull()
      .default(true),

    loginNotificationEnabled: boolean('login_notification_enabled')
      .notNull()
      .default(true),

    securityNotificationEnabled: boolean('security_notification_enabled')
      .notNull()
      .default(true),

    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('admin_security_settings_user_id_unique')
      .on(table.adminUserId),

    check(
      'admin_security_settings_backup_verification_consistency',
      sql`${table.backupEmailEncrypted} IS NOT NULL
          OR ${table.backupEmailVerifiedAt} IS NULL`,
    ),
  ],
);
