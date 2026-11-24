CREATE TABLE "outcome_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"digital_confidence" integer NOT NULL,
	"tasks_digital" integer NOT NULL,
	"income" integer NOT NULL,
	"services" text NOT NULL,
	"jobs_or_customers" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by_user_id" integer,
	"verification_note" text,
	CONSTRAINT "outcome_surveys_kind" CHECK ("kind" in ('baseline', 'endline')),
	CONSTRAINT "outcome_surveys_confidence" CHECK ("digital_confidence" between 0 and 10),
	CONSTRAINT "outcome_surveys_tasks" CHECK ("tasks_digital" between 0 and 100000),
	CONSTRAINT "outcome_surveys_income" CHECK ("income" between 0 and 1000000000),
	CONSTRAINT "outcome_surveys_jobs" CHECK ("jobs_or_customers" between 0 and 100000),
	CONSTRAINT "outcome_surveys_services" CHECK (char_length(btrim("services")) between 1 and 400),
	CONSTRAINT "outcome_surveys_verified" CHECK ((
		"verified_at" is null
		and "verified_by_user_id" is null
		and "verification_note" is null
	) or (
		"verified_at" is not null
		and "verified_by_user_id" is not null
		and "verified_by_user_id" <> "user_id"
		and "verification_note" is not null
		and char_length(btrim("verification_note")) between 1 and 400
	))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "outcome_surveys_user_kind" ON "outcome_surveys" USING btree ("user_id","kind");
--> statement-breakpoint
ALTER TABLE "outcome_surveys" ADD CONSTRAINT "outcome_surveys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "outcome_surveys" ADD CONSTRAINT "outcome_surveys_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ikiraro_freeze_outcome_survey()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' OR OLD.verified_at IS NOT NULL THEN
		RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME;
	END IF;
	IF NEW.digital_confidence IS DISTINCT FROM OLD.digital_confidence
		OR NEW.tasks_digital IS DISTINCT FROM OLD.tasks_digital
		OR NEW.income IS DISTINCT FROM OLD.income
		OR NEW.services IS DISTINCT FROM OLD.services
		OR NEW.jobs_or_customers IS DISTINCT FROM OLD.jobs_or_customers
		OR NEW.kind IS DISTINCT FROM OLD.kind
		OR NEW.user_id IS DISTINCT FROM OLD.user_id
	THEN
		RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME;
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS outcome_surveys_freeze ON outcome_surveys;
--> statement-breakpoint
CREATE TRIGGER outcome_surveys_freeze
BEFORE UPDATE OR DELETE ON outcome_surveys
FOR EACH ROW
EXECUTE FUNCTION ikiraro_freeze_outcome_survey();
