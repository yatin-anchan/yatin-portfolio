import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    parentId: uuid('parent_id'),

    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),
    category: varchar('category', { length: 100 }).notNull(),

    description: text('description'),

    proficiency: integer('proficiency'),

    iconUrl: text('icon_url'),

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
    uniqueIndex('skills_slug_unique').on(table.slug),
    index('skills_category_order_idx').on(
      table.category,
      table.displayOrder,
    ),
    index('skills_parent_idx').on(table.parentId),
  ],
);