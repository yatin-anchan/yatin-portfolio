
import {
  index,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './admin-users.js';

export const adminAuditLogs = pgTable(
  'admin_audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    adminId: uuid('admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'restrict' }),

    action: varchar('action', { length: 100 }).notNull(),

    entityType: varchar('entity_type', { length: 100 }),
    entityId: uuid('entity_id'),

    description: text('description'),

    oldValues: jsonb('old_values'),
    newValues: jsonb('new_values'),

    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('admin_audit_logs_admin_created_idx').on(
      table.adminId,
      table.createdAt,
    ),

    index('admin_audit_logs_entity_idx').on(
      table.entityType,
      table.entityId,
    ),

    index('admin_audit_logs_action_idx').on(table.action),

    index('admin_audit_logs_created_idx').on(table.createdAt),
  ],
);
