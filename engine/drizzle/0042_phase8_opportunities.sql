CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"skill" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_kind" CHECK ("kind" in ('job', 'apprenticeship', 'contract', 'training')),
	CONSTRAINT "opportunities_title" CHECK (char_length(btrim("title")) between 1 and 80),
	CONSTRAINT "opportunities_skill" CHECK (char_length(btrim("skill")) between 1 and 120),
	CONSTRAINT "opportunities_body" CHECK (char_length(btrim("body")) between 1 and 400)
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_partner_user_id_users_id_fk" FOREIGN KEY ("partner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_user_id" integer NOT NULL,
	"author_user_id" integer NOT NULL,
	"note" text NOT NULL,
	"shown_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_note" CHECK (char_length(btrim("note")) between 1 and 400)
);
--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ikiraro_reject_opportunity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS opportunities_append_only ON opportunities;
--> statement-breakpoint
CREATE TRIGGER opportunities_append_only
BEFORE UPDATE OR DELETE ON opportunities
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_opportunity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ikiraro_show_referral()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' OR OLD.shown_at IS NOT NULL THEN
		RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME;
	END IF;
	IF NEW.learner_user_id <> OLD.learner_user_id OR NEW.author_user_id <> OLD.author_user_id OR NEW.note <> OLD.note THEN
		RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME;
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS referrals_show ON referrals;
--> statement-breakpoint
CREATE TRIGGER referrals_show
BEFORE UPDATE OR DELETE ON referrals
FOR EACH ROW
EXECUTE FUNCTION ikiraro_show_referral();
