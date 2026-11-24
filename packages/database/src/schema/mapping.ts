
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const mapping = pgTable(
  'mapping',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Polymorphic reference to the owning record
    fid: uuid('fid').notNull(),
    type: varchar('type', { length: 50 }).notNull(),

    // Media information
    url: text('url').notNull(),
    mediaType: varchar('media_type', { length: 30 }).notNull(),

    mimeType: varchar('mime_type', { length: 100 }),
    fileName: varchar('file_name', { length: 255 }),
    fileSize: bigint('file_size', { mode: 'number' }),

    altText: varchar('alt_text', { length: 300 }),
    caption: text('caption'),

    // Storage information
    storageProvider: varchar('storage_provider', { length: 50 }),
    storageKey: text('storage_key'),
    externalUrl: text('external_url'),

    // Display settings
    isPrimary: boolean('is_primary').notNull().default(false),
    isVisible: boolean('is_visible').notNull().default(true),

    // Audit information
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('mapping_entity_idx').on(table.type, table.fid),

    check(
      'mapping_nonnegative_file_size',
      sql`${table.fileSize} IS NULL OR ${table.fileSize} >= 0`,
    ),

    check(
      'mapping_valid_media_type',
      sql`${table.mediaType} IN ('image', 'document', 'video', 'audio', 'other')`,
    ),
  ],
);
