
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

export const experience = pgTable(
  'experience',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    companyName: varchar('company_name', { length: 200 }).notNull(),
    role: varchar('role', { length: 200 }).notNull(),

    employmentType: varchar('employment_type', { length: 50 }).notNull(),
    location: varchar('location', { length: 200 }),
    workplaceType: varchar('workplace_type', { length: 30 }),

    description: text('description'),

    responsibilities: jsonb('responsibilities')
      .$type<string[]>()
      .notNull()
      .default([]),

    companyUrl: text('company_url'),
    companylogoUrl: text('companylogo_url'),

    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }),

    isCurrent: boolean('is_current').notNull().default(false),
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
    index('experience_public_order_idx').on(
      table.isPublished,
      table.displayOrder,
    ),

    index('experience_company_idx').on(table.companyName),

    check(
      'experience_valid_date_range',
      sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),

    check(
      'experience_current_has_no_end_date',
      sql`${table.isCurrent} = false OR ${table.endDate} IS NULL`,
    ),

    check(
      'experience_nonnegative_display_order',
      sql`${table.displayOrder} >= 0`,
    ),
  ],
);
