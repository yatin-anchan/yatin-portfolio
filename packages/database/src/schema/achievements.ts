
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export interface AchievementContentBlock {
  type: 'heading' | 'paragraph' | 'image' | 'list' | 'code';
  [key: string]: unknown;
}

export interface AchievementMedia {
  url: string;
  type: 'image' | 'document';
  alt: string;
}

export interface AchievementContent {
  version: 1;
  blocks: AchievementContentBlock[];
}

export const achievements = pgTable(
  'achievements',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    title: varchar('title', { length: 200 }).notNull(),
    category: varchar('category', { length: 50 }).notNull(),
    issuer: varchar('issuer', { length: 200 }),

    shortDescription: text('short_description').notNull(),

    content: jsonb('content')
      .$type<AchievementContent>()
      .notNull(),

    achievedDate: date('achieved_date', { mode: 'string' }),

    eventName: varchar('event_name', { length: 200 }),
    location: varchar('location', { length: 200 }),

    media: jsonb('media')
      .$type<AchievementMedia[]>()
      .notNull()
      .default([]),

    credentialUrl: text('credential_url'),

    isFeatured: boolean('is_featured').notNull().default(false),
    isPublished: boolean('is_published').notNull().default(false),

    displayOrder: integer('display_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('achievements_public_order_idx').on(
      table.isPublished,
      table.displayOrder,
    ),

    index('achievements_category_idx').on(table.category),

    check(
      'achievements_nonnegative_display_order',
      sql`${table.displayOrder} >= 0`,
    ),
  ],
);
