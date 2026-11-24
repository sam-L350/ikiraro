CREATE TABLE "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"due_on" date NOT NULL,
	"asked_at" timestamp with time zone,
	"in_use" boolean,
	"purpose" text,
	"answered_at" timestamp with time zone,
	"response" text DEFAULT 'waiting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_ups_day" CHECK ("day" in (30, 90, 180)),
	CONSTRAINT "follow_ups_response" CHECK ("response" in ('waiting', 'answered', 'unresponsive')),
	CONSTRAINT "follow_ups_answer" CHECK ((
		"response" = 'waiting'
		and "in_use" is null
		and "purpose" is null
		and "answered_at" is null
	) or (
		"response" = 'answered'
		and "answered_at" is not null
		and (
			("in_use" = true and "purpose" is not null and char_length(btrim("purpose")) between 1 and 400)
			or ("in_use" = false and "purpose" is null)
		)
	) or (
		"response" = 'unresponsive'
		and "asked_at" is not null
		and "in_use" is null
		and "purpose" is null
		and "answered_at" is null
	))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "follow_ups_grant_day" ON "follow_ups" USING btree ("grant_id","day");
--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_grant_id_hardware_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."hardware_grants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "follow_up_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follow_up_id" uuid NOT NULL,
	"media_object_id" uuid NOT NULL,
	"note" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_up_evidence_status" CHECK ("status" in ('pending', 'approved', 'needs_revision', 'rejected')),
	CONSTRAINT "follow_up_evidence_note" CHECK (char_length(btrim("note")) between 1 and 400)
);
--> statement-breakpoint
ALTER TABLE "follow_up_evidence" ADD CONSTRAINT "follow_up_evidence_follow_up_id_follow_ups_id_fk" FOREIGN KEY ("follow_up_id") REFERENCES "public"."follow_ups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "follow_up_evidence" ADD CONSTRAINT "follow_up_evidence_media_object_id_media_objects_id_fk" FOREIGN KEY ("media_object_id") REFERENCES "public"."media_objects"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "follow_up_evidence" ADD CONSTRAINT "follow_up_evidence_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "follow_up_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"reviewer_user_id" integer NOT NULL,
	"decision" text NOT NULL,
	"note" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_up_verifications_evidence" UNIQUE ("evidence_id"),
	CONSTRAINT "follow_up_verifications_decision" CHECK ("decision" in ('approved', 'needs_revision', 'rejected')),
	CONSTRAINT "follow_up_verifications_note" CHECK (char_length(btrim("note")) between 1 and 400)
);
--> statement-breakpoint
ALTER TABLE "follow_up_verifications" ADD CONSTRAINT "follow_up_verifications_evidence_id_follow_up_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."follow_up_evidence"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "follow_up_verifications" ADD CONSTRAINT "follow_up_verifications_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "follow_up_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follow_up_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" integer,
	"note" text,
	CONSTRAINT "follow_up_reviews_follow_up" UNIQUE ("follow_up_id"),
	CONSTRAINT "follow_up_reviews_close" CHECK ((
		"closed_at" is null
		and "closed_by_user_id" is null
		and "note" is null
	) or (
		"closed_at" is not null
		and "closed_by_user_id" is not null
		and "note" is not null
		and char_length(btrim("note")) between 1 and 400
	))
);
--> statement-breakpoint
ALTER TABLE "follow_up_reviews" ADD CONSTRAINT "follow_up_reviews_follow_up_id_follow_ups_id_fk" FOREIGN KEY ("follow_up_id") REFERENCES "public"."follow_ups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "follow_up_reviews" ADD CONSTRAINT "follow_up_reviews_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP TRIGGER IF EXISTS follow_up_verifications_append_only ON follow_up_verifications;
--> statement-breakpoint
CREATE TRIGGER follow_up_verifications_append_only
BEFORE UPDATE OR DELETE ON follow_up_verifications
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ikiraro_close_follow_up_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' OR OLD.closed_at IS NOT NULL THEN
		RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME;
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS follow_up_reviews_close ON follow_up_reviews;
--> statement-breakpoint
CREATE TRIGGER follow_up_reviews_close
BEFORE UPDATE OR DELETE ON follow_up_reviews
FOR EACH ROW
EXECUTE FUNCTION ikiraro_close_follow_up_review();
