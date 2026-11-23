CREATE TABLE "submission_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"reviewer_user_id" integer NOT NULL,
	"decision" text NOT NULL,
	"note" text NOT NULL,
	"reason_code" text,
	"score_total" integer,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_verifications_decision" CHECK ("submission_verifications"."decision" in ('approved', 'needs_revision', 'rejected')),
	CONSTRAINT "submission_verifications_reason" CHECK ("submission_verifications"."reason_code" is null or "submission_verifications"."reason_code" in ('not_the_task', 'not_the_learner', 'unreadable', 'incomplete')),
	CONSTRAINT "submission_verifications_reason_required" CHECK ((
				"submission_verifications"."decision" = 'rejected' and "submission_verifications"."reason_code" is not null
			) or (
				"submission_verifications"."decision" <> 'rejected' and "submission_verifications"."reason_code" is null
			)),
	CONSTRAINT "submission_verifications_note" CHECK (char_length(btrim("submission_verifications"."note")) > 0),
	CONSTRAINT "submission_verifications_score" CHECK ("submission_verifications"."score_total" is null or "submission_verifications"."score_total" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "verification_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verification_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"score" integer NOT NULL,
	CONSTRAINT "verification_scores_range" CHECK ("verification_scores"."score" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "submission_verifications" ADD CONSTRAINT "submission_verifications_submission_id_task_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_verifications" ADD CONSTRAINT "submission_verifications_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_scores" ADD CONSTRAINT "verification_scores_verification_id_submission_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."submission_verifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_scores" ADD CONSTRAINT "verification_scores_criterion_id_rubric_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."rubric_criteria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "submission_verifications_submission" ON "submission_verifications" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_scores_criterion" ON "verification_scores" USING btree ("verification_id","criterion_id");--> statement-breakpoint
DROP TRIGGER IF EXISTS submission_verifications_append_only ON submission_verifications;--> statement-breakpoint
CREATE TRIGGER submission_verifications_append_only
BEFORE UPDATE OR DELETE ON submission_verifications
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();--> statement-breakpoint
DROP TRIGGER IF EXISTS verification_scores_append_only ON verification_scores;--> statement-breakpoint
CREATE TRIGGER verification_scores_append_only
BEFORE UPDATE OR DELETE ON verification_scores
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();