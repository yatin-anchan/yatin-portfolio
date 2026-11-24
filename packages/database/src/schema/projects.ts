
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export type ProjectContentBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'image'; url: string; alt: string; caption?: string }
  | { type: 'list'; items: string[] }
  | { type: 'code'; language: string; code: string };

export interface ProjectContent {
  version: 1;
  blocks: ProjectContentBlock[];
}

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 220 }).notNull(),
    shortDescription: text('short_description').notNull(),
    content: jsonb('content').$type<ProjectContent>().notNull(),
    techStack: jsonb('tech_stack').$type<string[]>().notNull().default([]),
    thumbnailUrl: text('thumbnail_url'),
    repositoryUrl: text('repository_url'),
    liveUrl: text('live_url'),
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
    uniqueIndex('projects_slug_unique').on(table.slug),
    index('projects_public_order_idx').on(
      table.isPublished,
      table.displayOrder,
    ),
  ],
);

export const projectImages = pgTable(
  'project_images',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    imageUrl: text('image_url').notNull(),
    altText: varchar('alt_text', { length: 300 }).notNull(),
    caption: text('caption'),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('project_images_project_order_idx').on(
      table.projectId,
      table.displayOrder,
    ),
  ],
);
