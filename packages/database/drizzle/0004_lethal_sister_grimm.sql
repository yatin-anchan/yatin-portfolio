CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"category" varchar(50) NOT NULL,
	"issuer" varchar(200),
	"short_description" text NOT NULL,
	"content" jsonb NOT NULL,
	"achieved_date" date,
	"event_name" varchar(200),
	"location" varchar(200),
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"credential_url" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_nonnegative_display_order" CHECK ("achievements"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100),
	"entity_id" uuid,
	"description" text,
	"old_values" jsonb,
	"new_values" jsonb,
	"ip_address" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"issuing_organization" varchar(200) NOT NULL,
	"credential_id" varchar(200),
	"credential_url" text,
	"organization_logo_url" text,
	"certificate_image_url" text,
	"description" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issue_date" date NOT NULL,
	"expiry_date" date,
	"does_not_expire" boolean DEFAULT true NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certifications_valid_expiry" CHECK ("certifications"."expiry_date" IS NULL OR "certifications"."expiry_date" >= "certifications"."issue_date"),
	CONSTRAINT "certifications_non_expiring_has_no_expiry" CHECK ("certifications"."does_not_expire" = false OR "certifications"."expiry_date" IS NULL),
	CONSTRAINT "certifications_nonnegative_display_order" CHECK ("certifications"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"email" varchar(255) NOT NULL,
	"subject" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"attachment_url" text,
	"attachment_name" varchar(255),
	"status" varchar(30) DEFAULT 'unread' NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"admin_notes" text,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_messages_valid_status" CHECK ("contact_messages"."status" IN ('unread', 'read', 'replied', 'archived', 'spam')),
	CONSTRAINT "contact_messages_attachment_pair" CHECK (("contact_messages"."attachment_url" IS NULL) = ("contact_messages"."attachment_name" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "education" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_name" varchar(200) NOT NULL,
	"qualification" varchar(200) NOT NULL,
	"field_of_study" varchar(200),
	"education_level" varchar(50) NOT NULL,
	"location" varchar(200),
	"institution_url" text,
	"institution_logo_url" text,
	"description" text,
	"achievements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"grade_type" varchar(30),
	"grade_value" varchar(50),
	"grade_scale" varchar(30),
	"start_date" date NOT NULL,
	"end_date" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "education_valid_date_range" CHECK ("education"."end_date" IS NULL OR "education"."end_date" >= "education"."start_date"),
	CONSTRAINT "education_current_has_no_end_date" CHECK ("education"."is_current" = false OR "education"."end_date" IS NULL),
	CONSTRAINT "education_nonnegative_display_order" CHECK ("education"."display_order" >= 0),
	CONSTRAINT "education_valid_grade_type" CHECK ("education"."grade_type" IS NULL OR "education"."grade_type" IN ('grade', 'cgpa', 'percentage', 'percentile', 'gpa', 'other'))
);
--> statement-breakpoint
CREATE TABLE "experience" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" varchar(200) NOT NULL,
	"role" varchar(200) NOT NULL,
	"employment_type" varchar(50) NOT NULL,
	"location" varchar(200),
	"workplace_type" varchar(30),
	"description" text,
	"responsibilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"company_url" text,
	"companylogo_url" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experience_valid_date_range" CHECK ("experience"."end_date" IS NULL OR "experience"."end_date" >= "experience"."start_date"),
	CONSTRAINT "experience_current_has_no_end_date" CHECK ("experience"."is_current" = false OR "experience"."end_date" IS NULL),
	CONSTRAINT "experience_nonnegative_display_order" CHECK ("experience"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fid" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"url" text NOT NULL,
	"media_type" varchar(30) NOT NULL,
	"mime_type" varchar(100),
	"file_name" varchar(255),
	"file_size" bigint,
	"alt_text" varchar(300),
	"caption" text,
	"storage_provider" varchar(50),
	"storage_key" text,
	"external_url" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "mapping_nonnegative_file_size" CHECK ("mapping"."file_size" IS NULL OR "mapping"."file_size" >= 0),
	CONSTRAINT "mapping_valid_media_type" CHECK ("mapping"."media_type" IN ('image', 'document', 'video', 'audio', 'other'))
);
--> statement-breakpoint
CREATE TABLE "page_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page" varchar(100) NOT NULL,
	"section" varchar(100) NOT NULL,
	"title" varchar(200),
	"subtitle" varchar(250),
	"content" jsonb,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "page_content_page_section_unique" UNIQUE("page","section"),
	CONSTRAINT "page_content_valid_status" CHECK ("page_content"."status" IN ('draft', 'published')),
	CONSTRAINT "page_content_nonnegative_display_order" CHECK ("page_content"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(150) NOT NULL,
	"professional_title" varchar(200) NOT NULL,
	"tagline" varchar(250),
	"profile_image_url" text,
	"cover_image_url" text,
	"short_bio" text,
	"about_content" jsonb,
	"email" varchar(255),
	"is_email_visible" boolean DEFAULT true NOT NULL,
	"phone" varchar(30),
	"is_phone_visible" boolean DEFAULT false NOT NULL,
	"location" varchar(200),
	"resume_url" text,
	"availability_status" varchar(30) DEFAULT 'available' NOT NULL,
	"years_of_experience" numeric(4, 1),
	"seo_title" varchar(200),
	"seo_description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_valid_availability_status" CHECK ("profiles"."availability_status" IN ('available', 'employed', 'unavailable')),
	CONSTRAINT "profiles_nonnegative_experience" CHECK ("profiles"."years_of_experience" IS NULL OR "profiles"."years_of_experience" >= 0)
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"group" varchar(50) DEFAULT 'general' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "site_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" varchar(100) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"category" varchar(100) NOT NULL,
	"description" text,
	"proficiency" integer,
	"icon_url" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" varchar(50) NOT NULL,
	"label" varchar(100) NOT NULL,
	"url" text NOT NULL,
	"category" varchar(50) DEFAULT 'social' NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_links_valid_category" CHECK ("social_links"."category" IN ('social', 'professional', 'website', 'other')),
	CONSTRAINT "social_links_nonnegative_display_order" CHECK ("social_links"."display_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achievements_public_order_idx" ON "achievements" USING btree ("is_published","display_order");--> statement-breakpoint
CREATE INDEX "achievements_category_idx" ON "achievements" USING btree ("category");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_admin_created_idx" ON "admin_audit_logs" USING btree ("admin_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_entity_idx" ON "admin_audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_action_idx" ON "admin_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_created_idx" ON "admin_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "certifications_public_order_idx" ON "certifications" USING btree ("is_published","display_order");--> statement-breakpoint
CREATE INDEX "certifications_issuer_idx" ON "certifications" USING btree ("issuing_organization");--> statement-breakpoint
CREATE INDEX "contact_messages_status_created_idx" ON "contact_messages" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "contact_messages_email_idx" ON "contact_messages" USING btree ("email");--> statement-breakpoint
CREATE INDEX "education_public_order_idx" ON "education" USING btree ("is_published","display_order");--> statement-breakpoint
CREATE INDEX "education_institution_idx" ON "education" USING btree ("institution_name");--> statement-breakpoint
CREATE INDEX "experience_public_order_idx" ON "experience" USING btree ("is_published","display_order");--> statement-breakpoint
CREATE INDEX "experience_company_idx" ON "experience" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "mapping_entity_idx" ON "mapping" USING btree ("type","fid");--> statement-breakpoint
CREATE INDEX "page_content_public_order_idx" ON "page_content" USING btree ("page","status","is_visible","display_order");--> statement-breakpoint
CREATE INDEX "site_settings_group_idx" ON "site_settings" USING btree ("group");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_slug_unique" ON "skills" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "skills_category_order_idx" ON "skills" USING btree ("category","display_order");--> statement-breakpoint
CREATE INDEX "skills_parent_idx" ON "skills" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "social_links_public_order_idx" ON "social_links" USING btree ("is_visible","display_order");--> statement-breakpoint
CREATE INDEX "social_links_platform_idx" ON "social_links" USING btree ("platform");