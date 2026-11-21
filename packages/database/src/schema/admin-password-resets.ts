
import {
  pgTable,
  uuid,
  varchar,
  inet,
  timestamp,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm';
import { adminEmails } from './admin-emails.js';

export const adminPasswordResets = pgTable(
  'admin_password_resets',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    adminEmailId: uuid('admin_email_id')
      .notNull()
      .references(() => adminEmails.id, {
        onDelete: 'restrict',
      }),

    tokenHash: varchar('token_hash', { length: 64 })
      .notNull(),

    requestedIp: inet('requested_ip'),

    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull().defaultNow(),

    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),

    usedAt: timestamp('used_at', {
      withTimezone: true,
      mode: 'date',
    }),

    invalidatedAt: timestamp('invalidated_at', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  (table) => [
    uniqueIndex('admin_password_resets_token_hash_unique')
      .on(table.tokenHash),

    uniqueIndex('admin_password_resets_one_pending_per_email')
      .on(table.adminEmailId)
      .where(sql`${table.usedAt} IS NULL AND ${table.invalidatedAt} IS NULL`),

    index('admin_password_resets_email_id_idx')
      .on(table.adminEmailId),

    index('admin_password_resets_expires_at_idx')
      .on(table.expiresAt),

    check(
      'admin_password_resets_expiry_after_creation',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),

    check(
      'admin_password_resets_single_terminal_state',
      sql`${table.usedAt} IS NULL OR ${table.invalidatedAt} IS NULL`,
    ),
  ],
);
