DROP INDEX "admin_emails_one_primary";--> statement-breakpoint
ALTER TABLE "admin_emails" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_emails_one_primary" ON "admin_emails" USING btree ("admin_user_id") WHERE "admin_emails"."is_primary" = true AND "admin_emails"."removed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "admin_emails" ADD CONSTRAINT "admin_emails_removed_cannot_be_primary" CHECK ("admin_emails"."removed_at" IS NULL OR "admin_emails"."is_primary" = false);