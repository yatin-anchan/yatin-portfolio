
import {
  pgTable,
  uuid,
  varchar,
  text,
  inet,
  timestamp,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm';
import { adminEmails } from './admin-emails.js';

export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    adminEmailId: uuid('admin_email_id')
      .notNull()
      .references(() => adminEmails.id, {
        onDelete: 'restrict',
      }),

    tokenHash: varchar('token_hash', { length: 64 })
      .notNull(),

    ipAddress: inet('ip_address'),

    userAgent: text('user_agent'),

    deviceType: varchar('device_type', { length: 30 }),

    browser: varchar('browser', { length: 100 }),

    operatingSystem: varchar('operating_system', { length: 100 }),

    location: varchar('location', { length: 255 }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull().defaultNow(),

    lastSeenAt: timestamp('last_seen_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull().defaultNow(),

    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),

    revokedAt: timestamp('revoked_at', {
      withTimezone: true,
      mode: 'date',
    }),

    revocationReason: varchar('revocation_reason', {
      length: 100,
    }),
  },
  (table) => [
    uniqueIndex('admin_sessions_token_hash_unique')
      .on(table.tokenHash),

    index('admin_sessions_email_id_idx')
      .on(table.adminEmailId),

    index('admin_sessions_expires_at_idx')
      .on(table.expiresAt),

    index('admin_sessions_created_at_idx')
      .on(table.createdAt),

    check(
      'admin_sessions_expiry_after_creation',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),

    check(
      'admin_sessions_revocation_consistency',
      sql`(${table.revokedAt} IS NULL AND ${table.revocationReason} IS NULL)
          OR (${table.revokedAt} IS NOT NULL)`,
    ),
  ],
);
