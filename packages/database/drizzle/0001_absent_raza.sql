CREATE TABLE "admin_email_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"admin_email_id" uuid,
	"recipient_type" varchar(20) NOT NULL,
	"purpose" varchar(40) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_email_verifications_recipient_consistency" CHECK ((
        "admin_email_verifications"."recipient_type" = 'login_email'
        AND "admin_email_verifications"."admin_email_id" IS NOT NULL
      ) OR (
        "admin_email_verifications"."recipient_type" = 'backup_email'
        AND "admin_email_verifications"."admin_email_id" IS NULL
      )),
	CONSTRAINT "admin_email_verifications_valid_recipient_type" CHECK ("admin_email_verifications"."recipient_type" IN ('login_email', 'backup_email')),
	CONSTRAINT "admin_email_verifications_valid_purpose" CHECK ("admin_email_verifications"."purpose" IN (
        'add_login_email',
        'change_primary_email',
        'backup_email',
        'sensitive_action'
      )),
	CONSTRAINT "admin_email_verifications_attempt_limit" CHECK ("admin_email_verifications"."attempts" BETWEEN 0 AND 5),
	CONSTRAINT "admin_email_verifications_expiry_after_creation" CHECK ("admin_email_verifications"."expires_at" > "admin_email_verifications"."created_at"),
	CONSTRAINT "admin_email_verifications_single_terminal_state" CHECK ("admin_email_verifications"."consumed_at" IS NULL OR "admin_email_verifications"."invalidated_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "admin_password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_email_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"requested_ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	CONSTRAINT "admin_password_resets_expiry_after_creation" CHECK ("admin_password_resets"."expires_at" > "admin_password_resets"."created_at"),
	CONSTRAINT "admin_password_resets_single_terminal_state" CHECK ("admin_password_resets"."used_at" IS NULL OR "admin_password_resets"."invalidated_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "admin_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "admin_security_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"backup_email_encrypted" text,
	"backup_email_verified_at" timestamp with time zone,
	"require_dual_verification" boolean DEFAULT true NOT NULL,
	"login_notification_enabled" boolean DEFAULT true NOT NULL,
	"security_notification_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_security_settings_backup_verification_consistency" CHECK ("admin_security_settings"."backup_email_encrypted" IS NOT NULL
          OR "admin_security_settings"."backup_email_verified_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_email_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"device_type" varchar(30),
	"browser" varchar(100),
	"operating_system" varchar(100),
	"location" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" varchar(100),
	CONSTRAINT "admin_sessions_expiry_after_creation" CHECK ("admin_sessions"."expires_at" > "admin_sessions"."created_at"),
	CONSTRAINT "admin_sessions_revocation_consistency" CHECK (("admin_sessions"."revoked_at" IS NULL AND "admin_sessions"."revocation_reason" IS NULL)
          OR ("admin_sessions"."revoked_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "admin_emails_id_user_id_unique" ON "admin_emails" USING btree ("id","admin_user_id");
--> statement-breakpoint
ALTER TABLE "admin_email_verifications" ADD CONSTRAINT "admin_email_verifications_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_email_verifications" ADD CONSTRAINT "admin_email_verifications_email_owner_fk" FOREIGN KEY ("admin_email_id","admin_user_id") REFERENCES "public"."admin_emails"("id","admin_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_password_resets" ADD CONSTRAINT "admin_password_resets_admin_email_id_admin_emails_id_fk" FOREIGN KEY ("admin_email_id") REFERENCES "public"."admin_emails"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_recovery_codes" ADD CONSTRAINT "admin_recovery_codes_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_security_settings" ADD CONSTRAINT "admin_security_settings_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_email_id_admin_emails_id_fk" FOREIGN KEY ("admin_email_id") REFERENCES "public"."admin_emails"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_email_verifications_user_id_idx" ON "admin_email_verifications" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "admin_email_verifications_email_id_idx" ON "admin_email_verifications" USING btree ("admin_email_id");--> statement-breakpoint
CREATE INDEX "admin_email_verifications_expiry_idx" ON "admin_email_verifications" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_password_resets_token_hash_unique" ON "admin_password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_password_resets_one_pending_per_email" ON "admin_password_resets" USING btree ("admin_email_id") WHERE "admin_password_resets"."used_at" IS NULL AND "admin_password_resets"."invalidated_at" IS NULL;--> statement-breakpoint
CREATE INDEX "admin_password_resets_email_id_idx" ON "admin_password_resets" USING btree ("admin_email_id");--> statement-breakpoint
CREATE INDEX "admin_password_resets_expires_at_idx" ON "admin_password_resets" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_recovery_codes_hash_unique" ON "admin_recovery_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "admin_recovery_codes_user_id_idx" ON "admin_recovery_codes" USING btree ("admin_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_security_settings_user_id_unique" ON "admin_security_settings" USING btree ("admin_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_hash_unique" ON "admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_sessions_email_id_idx" ON "admin_sessions" USING btree ("admin_email_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "admin_sessions_created_at_idx" ON "admin_sessions" USING btree ("created_at");--> statement-breakpoint

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_admin_security_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER admin_security_settings_updated_at_trigger
BEFORE UPDATE ON public.admin_security_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_admin_security_settings_updated_at();