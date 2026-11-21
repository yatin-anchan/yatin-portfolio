import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm';
import { adminUsers } from './admin-users.js';

export const adminEmails = pgTable(
  'admin_emails',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, {
        onDelete: 'cascade',
      }),

    email: varchar('email', { length: 254 })
      .notNull(),

    passwordHash: text('password_hash')
      .notNull(),

    isPrimary: boolean('is_primary')
      .notNull()
      .default(false),

    isVerified: boolean('is_verified')
      .notNull()
      .default(false),

    verifiedAt: timestamp('verified_at', {
      withTimezone: true,
      mode: 'date',
    }),

    removedAt: timestamp('removed_at', {
  withTimezone: true,
  mode: 'date',
}),

    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('admin_emails_email_unique')
      .on(sql`lower(${table.email})`),

      uniqueIndex('admin_emails_id_user_id_unique')
  .on(table.id, table.adminUserId),

    uniqueIndex('admin_emails_one_primary')
  .on(table.adminUserId)
  .where(
    sql`${table.isPrimary} = true AND ${table.removedAt} IS NULL`,
  ),

    index('admin_emails_admin_user_id_idx')
      .on(table.adminUserId),



    check(
      'admin_emails_primary_must_be_verified',
      sql`${table.isPrimary} = false OR ${table.isVerified} = true`,
    ),

    check(
  'admin_emails_removed_cannot_be_primary',
  sql`${table.removedAt} IS NULL OR ${table.isPrimary} = false`,
),

    check(
      'admin_emails_verification_timestamp_consistency',
      sql`(${table.isVerified} = true AND ${table.verifiedAt} IS NOT NULL)
          OR (${table.isVerified} = false AND ${table.verifiedAt} IS NULL)`,
    ),
  ],
);