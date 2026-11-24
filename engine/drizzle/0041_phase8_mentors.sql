CREATE TABLE "mentors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"weekly_contact_cap" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"decided_by_user_id" integer,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentors_kind" CHECK ("kind" in ('mentor', 'partner')),
	CONSTRAINT "mentors_cap" CHECK ("weekly_contact_cap" between 0 and 10000),
	CONSTRAINT "mentors_status" CHECK ("status" in ('pending', 'approved', 'declined')),
	CONSTRAINT "mentors_decision" CHECK (
		("status" = 'pending' AND "decided_at" IS NULL AND "note" IS NULL)
		OR ("status" = 'approved' AND "decided_at" IS NOT NULL AND "decided_by_user_id" IS NOT NULL AND "note" IS NULL)
		OR ("status" = 'declined' AND "decided_at" IS NOT NULL AND "decided_by_user_id" IS NOT NULL AND "note" IS NOT NULL AND char_length(btrim("note")) between 1 and 400)
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mentors_one_open" ON "mentors" USING btree ("user_id") WHERE "status" in ('pending', 'approved');
--> statement-breakpoint
ALTER TABLE "mentors" ADD CONSTRAINT "mentors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mentors" ADD CONSTRAINT "mentors_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "mentor_opt_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"skill" text NOT NULL,
	"district_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_opt_ins_skill" CHECK (char_length(btrim("skill")) between 1 and 80)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mentor_opt_ins_choice" ON "mentor_opt_ins" USING btree ("user_id","skill","district_id");
--> statement-breakpoint
ALTER TABLE "mentor_opt_ins" ADD CONSTRAINT "mentor_opt_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mentor_opt_ins" ADD CONSTRAINT "mentor_opt_ins_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "mentor_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mentor_id" uuid NOT NULL,
	"opt_in_id" uuid NOT NULL,
	"learner_user_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "mentor_requests_status" CHECK ("status" in ('pending', 'accepted', 'declined')),
	CONSTRAINT "mentor_requests_decision" CHECK (
		("status" = 'pending' AND "decided_at" IS NULL)
		OR ("status" <> 'pending' AND "decided_at" IS NOT NULL)
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mentor_requests_one_pending" ON "mentor_requests" USING btree ("mentor_id","learner_user_id") WHERE "status" = 'pending';
--> statement-breakpoint
ALTER TABLE "mentor_requests" ADD CONSTRAINT "mentor_requests_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mentor_requests" ADD CONSTRAINT "mentor_requests_opt_in_id_mentor_opt_ins_id_fk" FOREIGN KEY ("opt_in_id") REFERENCES "public"."mentor_opt_ins"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mentor_requests" ADD CONSTRAINT "mentor_requests_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ikiraro_close_mentor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' OR OLD.status <> 'pending' THEN
		RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME;
	END IF;
	IF NEW.user_id <> OLD.user_id OR NEW.kind <> OLD.kind OR NEW.weekly_contact_cap <> OLD.weekly_contact_cap THEN
		RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME;
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS mentors_close ON mentors;
--> statement-breakpoint
CREATE TRIGGER mentors_close
BEFORE UPDATE OR DELETE ON mentors
FOR EACH ROW
EXECUTE FUNCTION ikiraro_close_mentor();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ikiraro_close_mentor_request()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' OR OLD.status <> 'pending' THEN
		RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME;
	END IF;
	IF NEW.mentor_id <> OLD.mentor_id OR NEW.opt_in_id <> OLD.opt_in_id OR NEW.learner_user_id <> OLD.learner_user_id THEN
		RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME;
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS mentor_requests_close ON mentor_requests;
--> statement-breakpoint
CREATE TRIGGER mentor_requests_close
BEFORE UPDATE OR DELETE ON mentor_requests
FOR EACH ROW
EXECUTE FUNCTION ikiraro_close_mentor_request();
