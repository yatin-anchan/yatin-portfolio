import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const siteSettings = pgTable(
  'site_settings',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    key: varchar('key', { length: 100 }).notNull().unique(),

    value: jsonb('value').notNull(),

    description: text('description'),

    group: varchar('group', { length: 50 })
      .notNull()
      .default('general'),

    isPublic: boolean('is_public')
      .notNull()
      .default(false),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('site_settings_group_idx').on(table.group),
  ],
);
