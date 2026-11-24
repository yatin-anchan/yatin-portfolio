
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

export const education = pgTable(
  'education',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    institutionName: varchar('institution_name', { length: 200 }).notNull(),
    qualification: varchar('qualification', { length: 200 }).notNull(),
    fieldOfStudy: varchar('field_of_study', { length: 200 }),

    educationLevel: varchar('education_level', { length: 50 }).notNull(),

    location: varchar('location', { length: 200 }),
    institutionUrl: text('institution_url'),
    institutionLogoUrl: text('institution_logo_url'),

    description: text('description'),

    achievements: jsonb('achievements')
      .$type<string[]>()
      .notNull()
      .default([]),

    gradeType: varchar('grade_type', { length: 30 }),
    gradeValue: varchar('grade_value', { length: 50 }),
    gradeScale: varchar('grade_scale', { length: 30 }),

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
    index('education_public_order_idx').on(
      table.isPublished,
      table.displayOrder,
    ),

    index('education_institution_idx').on(table.institutionName),

    check(
      'education_valid_date_range',
      sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),

    check(
      'education_current_has_no_end_date',
      sql`${table.isCurrent} = false OR ${table.endDate} IS NULL`,
    ),

    check(
      'education_nonnegative_display_order',
      sql`${table.displayOrder} >= 0`,
    ),

    check(
      'education_valid_grade_type',
      sql`${table.gradeType} IS NULL OR ${table.gradeType} IN ('grade', 'cgpa', 'percentage', 'percentile', 'gpa', 'other')`,
    ),
  ],
);

