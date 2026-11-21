
import {
  pgTable,
  uuid,
  varchar,
  smallint,
  timestamp,
  index,
  check,
  foreignKey,
} from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm';
import { adminUsers } from './admin-users.js';
import { adminEmails } from './admin-emails.js';

export const adminEmailVerifications = pgTable(
  'admin_email_verifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, {
        onDelete: 'cascade',
      }),

    adminEmailId: uuid('admin_email_id'),

    recipientType: varchar('recipient_type', {
      length: 20,
    }).notNull(),

    purpose: varchar('purpose', {
      length: 40,
    }).notNull(),

    codeHash: varchar('code_hash', {
      length: 64,
    }).notNull(),

    attempts: smallint('attempts')
      .notNull()
      .default(0),

    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),

    consumedAt: timestamp('consumed_at', {
      withTimezone: true,
      mode: 'date',
    }),

    invalidatedAt: timestamp('invalidated_at', {
      withTimezone: true,
      mode: 'date',
    }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull().defaultNow(),
  },
  (table) => [
    index('admin_email_verifications_user_id_idx')
      .on(table.adminUserId),

    index('admin_email_verifications_email_id_idx')
      .on(table.adminEmailId),

    index('admin_email_verifications_expiry_idx')
      .on(table.expiresAt),

    foreignKey({
  name: 'admin_email_verifications_email_owner_fk',
  columns: [table.adminEmailId, table.adminUserId],
  foreignColumns: [adminEmails.id, adminEmails.adminUserId],
}).onDelete('cascade'),

    check(
      'admin_email_verifications_recipient_consistency',
      sql`(
        ${table.recipientType} = 'login_email'
        AND ${table.adminEmailId} IS NOT NULL
      ) OR (
        ${table.recipientType} = 'backup_email'
        AND ${table.adminEmailId} IS NULL
      )`,
    ),

    check(
      'admin_email_verifications_valid_recipient_type',
      sql`${table.recipientType} IN ('login_email', 'backup_email')`,
    ),

    check(
      'admin_email_verifications_valid_purpose',
      sql`${table.purpose} IN (
        'add_login_email',
        'change_primary_email',
        'backup_email',
        'sensitive_action'
      )`,
    ),

    check(
      'admin_email_verifications_attempt_limit',
      sql`${table.attempts} BETWEEN 0 AND 5`,
    ),

    check(
      'admin_email_verifications_expiry_after_creation',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),

    check(
      'admin_email_verifications_single_terminal_state',
      sql`${table.consumedAt} IS NULL OR ${table.invalidatedAt} IS NULL`,
    ),
  ],
);
