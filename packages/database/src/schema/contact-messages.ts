
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  inet,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const contactMessages = pgTable(
  'contact_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    name: varchar('name', { length: 150 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),

    subject: varchar('subject', { length: 200 }).notNull(),
    message: text('message').notNull(),

    attachmentUrl: text('attachment_url'),
    attachmentName: varchar('attachment_name', { length: 255 }),

    status: varchar('status', { length: 30 })
      .notNull()
      .default('unread'),

    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),

    adminNotes: text('admin_notes'),
    repliedAt: timestamp('replied_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('contact_messages_status_created_idx').on(
      table.status,
      table.createdAt,
    ),

    index('contact_messages_email_idx').on(table.email),

    check(
      'contact_messages_valid_status',
      sql`${table.status} IN ('unread', 'read', 'replied', 'archived', 'spam')`,
    ),

    check(
      'contact_messages_attachment_pair',
      sql`(${table.attachmentUrl} IS NULL) = (${table.attachmentName} IS NULL)`,
    ),
  ],
);
