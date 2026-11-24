
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const socialLinks = pgTable(
  'social_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    platform: varchar('platform', { length: 50 }).notNull(),

    label: varchar('label', { length: 100 }).notNull(),

    url: text('url').notNull(),

    category: varchar('category', { length: 50 })
      .notNull()
      .default('social'),

    isVisible: boolean('is_visible')
      .notNull()
      .default(true),

    displayOrder: integer('display_order')
      .notNull()
      .default(0),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('social_links_public_order_idx').on(
      table.isVisible,
      table.displayOrder,
    ),

    index('social_links_platform_idx').on(table.platform),

    check(
      'social_links_valid_category',
      sql`${table.category} IN ('social', 'professional', 'website', 'other')`,
    ),

    check(
      'social_links_nonnegative_display_order',
      sql`${table.displayOrder} >= 0`,
    ),
  ],
);
