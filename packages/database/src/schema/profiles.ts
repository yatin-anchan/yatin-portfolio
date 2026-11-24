
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export interface ProfileContentBlock {
  type: 'heading' | 'paragraph' | 'image' | 'list' | 'code';
  [key: string]: unknown;
}

export interface ProfileAboutContent {
  version: 1;
  blocks: ProfileContentBlock[];
}

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    fullName: varchar('full_name', { length: 150 }).notNull(),
    professionalTitle: varchar('professional_title', { length: 200 }).notNull(),
    tagline: varchar('tagline', { length: 250 }),

    profileImageUrl: text('profile_image_url'),
    coverImageUrl: text('cover_image_url'),

    shortBio: text('short_bio'),

    aboutContent: jsonb('about_content')
      .$type<ProfileAboutContent>(),

    email: varchar('email', { length: 255 }),
    isEmailVisible: boolean('is_email_visible')
      .notNull()
      .default(true),

    phone: varchar('phone', { length: 30 }),
    isPhoneVisible: boolean('is_phone_visible')
      .notNull()
      .default(false),

    location: varchar('location', { length: 200 }),

    resumeUrl: text('resume_url'),

    availabilityStatus: varchar('availability_status', {
      length: 30,
    })
      .notNull()
      .default('available'),

    yearsOfExperience: numeric('years_of_experience', {
      precision: 4,
      scale: 1,
    }),

    seoTitle: varchar('seo_title', { length: 200 }),
    seoDescription: text('seo_description'),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'profiles_valid_availability_status',
      sql`${table.availabilityStatus} IN ('available', 'employed', 'unavailable')`,
    ),

    check(
      'profiles_nonnegative_experience',
      sql`${table.yearsOfExperience} IS NULL OR ${table.yearsOfExperience} >= 0`,
    ),
  ],
);
