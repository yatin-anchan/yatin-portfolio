
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export interface PageContentBlock {
  type: 'heading' | 'paragraph' | 'image' | 'list' | 'code';
  [key: string]: unknown;
}

export interface PageContentData {
  version: 1;
  blocks: PageContentBlock[];
}

export const pageContent = pgTable(
  'page_content',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    page: varchar('page', { length: 100 }).notNull(),
    section: varchar('section', { length: 100 }).notNull(),

    title: varchar('title', { length: 200 }),
    subtitle: varchar('subtitle', { length: 250 }),

    content: jsonb('content').$type<PageContentData>(),

    status: varchar('status', { length: 30 })
      .notNull()
      .default('draft'),

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

    updatedBy: uuid('updated_by'),
  },
  (table) => [
    unique('page_content_page_section_unique').on(
      table.page,
      table.section,
    ),

    index('page_content_public_order_idx').on(
      table.page,
      table.status,
      table.isVisible,
      table.displayOrder,
    ),

    check(
      'page_content_valid_status',
      sql`${table.status} IN ('draft', 'published')`,
    ),

    check(
      'page_content_nonnegative_display_order',
      sql`${table.displayOrder} >= 0`,
    ),
  ],
);
