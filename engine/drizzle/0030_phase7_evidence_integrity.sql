ALTER TABLE "task_submissions" ADD COLUMN "duplicate_kind" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_duplicate_kind" CHECK ("duplicate_kind" in ('none', 'same', 'other'));--> statement-breakpoint
CREATE INDEX "task_submissions_content_hash_idx" ON "task_submissions" USING btree ("content_hash") WHERE "content_hash" is not null;--> statement-breakpoint
ALTER TABLE "badges" ADD COLUMN "requires_in_person" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "in_person_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verification_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"reviewer_user_id" integer NOT NULL,
	"location" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "in_person_checks_verification_id_unique" UNIQUE ("verification_id"),
	CONSTRAINT "in_person_checks_location" CHECK (char_length(btrim("location")) between 1 and 160),
	CONSTRAINT "in_person_checks_time" CHECK ("observed_at" <= "recorded_at" + interval '2 minutes')
);--> statement-breakpoint
ALTER TABLE "in_person_checks" ADD CONSTRAINT "in_person_checks_verification_id_submission_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."submission_verifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "in_person_checks" ADD CONSTRAINT "in_person_checks_submission_id_task_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "in_person_checks" ADD CONSTRAINT "in_person_checks_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
