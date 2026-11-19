CREATE TABLE "admin_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_emails_primary_must_be_verified" CHECK ("admin_emails"."is_primary" = false OR "admin_emails"."is_verified" = true),
	CONSTRAINT "admin_emails_verification_timestamp_consistency" CHECK (("admin_emails"."is_verified" = true AND "admin_emails"."verified_at" IS NOT NULL)
          OR ("admin_emails"."is_verified" = false AND "admin_emails"."verified_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_emails" ADD CONSTRAINT "admin_emails_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_emails_email_unique" ON "admin_emails" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "admin_emails_one_primary" ON "admin_emails" USING btree ("admin_user_id") WHERE "admin_emails"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "admin_emails_admin_user_id_idx" ON "admin_emails" USING btree ("admin_user_id");


--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.set_admin_users_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

--> statement-breakpoint

CREATE TRIGGER admin_users_updated_at_trigger
BEFORE UPDATE ON public.admin_users
FOR EACH ROW
EXECUTE FUNCTION public.set_admin_users_updated_at();


--> statement-breakpoint


CREATE OR REPLACE FUNCTION public.check_admin_primary_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_admin_id uuid;
    primary_email_count integer;
BEGIN
    /*
     * Administrator creation:
     * Verify that the newly created account has exactly
     * one verified primary email at transaction commit.
     */
    IF TG_TABLE_NAME = 'admin_users' THEN

        target_admin_id := NEW.id;

        PERFORM id
        FROM public.admin_users
        WHERE id = target_admin_id
        FOR NO KEY UPDATE;

        IF NOT FOUND THEN
            RETURN NULL;
        END IF;

        SELECT COUNT(*)
        INTO primary_email_count
        FROM public.admin_emails
        WHERE admin_user_id = target_admin_id
          AND is_primary = TRUE
          AND is_verified = TRUE;

        IF primary_email_count <> 1 THEN
            RAISE EXCEPTION
                'Administrator % must have exactly one verified primary email',
                target_admin_id;
        END IF;

    ELSE

        /*
         * Email deletion or reassignment:
         * Check the previous administrator.
         */
        IF TG_OP IN ('DELETE', 'UPDATE') THEN

            target_admin_id := OLD.admin_user_id;

            PERFORM id
            FROM public.admin_users
            WHERE id = target_admin_id
            FOR NO KEY UPDATE;

            IF FOUND THEN

                SELECT COUNT(*)
                INTO primary_email_count
                FROM public.admin_emails
                WHERE admin_user_id = target_admin_id
                  AND is_primary = TRUE
                  AND is_verified = TRUE;

                IF primary_email_count <> 1 THEN
                    RAISE EXCEPTION
                        'Administrator % must have exactly one verified primary email',
                        target_admin_id;
                END IF;

            END IF;
        END IF;

        /*
         * Email insertion or reassignment:
         * Check the new administrator.
         */
        IF TG_OP IN ('INSERT', 'UPDATE') THEN

            target_admin_id := NEW.admin_user_id;

            PERFORM id
            FROM public.admin_users
            WHERE id = target_admin_id
            FOR NO KEY UPDATE;

            IF FOUND THEN

                SELECT COUNT(*)
                INTO primary_email_count
                FROM public.admin_emails
                WHERE admin_user_id = target_admin_id
                  AND is_primary = TRUE
                  AND is_verified = TRUE;

                IF primary_email_count <> 1 THEN
                    RAISE EXCEPTION
                        'Administrator % must have exactly one verified primary email',
                        target_admin_id;
                END IF;

            END IF;
        END IF;
    END IF;

    RETURN NULL;
END;
$$;


--> statement-breakpoint

CREATE CONSTRAINT TRIGGER admin_users_primary_email_check
AFTER INSERT ON public.admin_users
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.check_admin_primary_email();

--> statement-breakpoint

CREATE CONSTRAINT TRIGGER admin_emails_primary_email_check
AFTER INSERT OR UPDATE OR DELETE ON public.admin_emails
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.check_admin_primary_email();