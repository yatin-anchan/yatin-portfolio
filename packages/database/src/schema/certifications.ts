
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

export const certifications = pgTable(
  'certifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    title: varchar('title', { length: 200 }).notNull(),
    issuingOrganization: varchar('issuing_organization', {
      length: 200,
    }).notNull(),

    credentialId: varchar('credential_id', { length: 200 }),
    credentialUrl: text('credential_url'),

    organizationLogoUrl: text('organization_logo_url'),
    certificateImageUrl: text('certificate_image_url'),

    description: text('description'),

    skills: jsonb('skills')
      .$type<string[]>()
      .notNull()
      .default([]),

    issueDate: date('issue_date', { mode: 'string' }).notNull(),
    expiryDate: date('expiry_date', { mode: 'string' }),

    doesNotExpire: boolean('does_not_expire')
      .notNull()
      .default(true),

    isPublished: boolean('is_published')
      .notNull()
      .default(false),

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
    index('certifications_public_order_idx').on(
      table.isPublished,
      table.displayOrder,
    ),

    index('certifications_issuer_idx').on(
      table.issuingOrganization,
    ),

    check(
      'certifications_valid_expiry',
      sql`${table.expiryDate} IS NULL OR ${table.expiryDate} >= ${table.issueDate}`,
    ),

    check(
      'certifications_non_expiring_has_no_expiry',
      sql`${table.doesNotExpire} = false OR ${table.expiryDate} IS NULL`,
    ),

    check(
      'certifications_nonnegative_display_order',
      sql`${table.displayOrder} >= 0`,
    ),
  ],
);
    