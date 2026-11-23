CREATE TABLE "appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"verification_id" uuid NOT NULL,
	"learner_user_id" integer NOT NULL,
	"first_reviewer_user_id" integer NOT NULL,
	"note" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decision_note" text,
	"decided_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "appeals_submission_id_unique" UNIQUE ("submission_id"),
	CONSTRAINT "appeals_verification_id_unique" UNIQUE ("verification_id"),
	CONSTRAINT "appeals_status" CHECK ("status" in ('open', 'upheld', 'overturned')),
	CONSTRAINT "appeals_note" CHECK (char_length(btrim("note")) between 1 and 500),
	CONSTRAINT "appeals_shape" CHECK ((
		"status" = 'open'
		and "decided_by_user_id" is null
		and "decision_note" is null
		and "decided_at" is null
	) or (
		"status" in ('upheld', 'overturned')
		and "decided_by_user_id" is not null
		and "decided_by_user_id" <> "first_reviewer_user_id"
		and "decided_by_user_id" <> "learner_user_id"
		and "decision_note" is not null
		and char_length(btrim("decision_note")) between 1 and 500
		and "decided_at" is not null
	))
);--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_submission_id_task_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_verification_id_submission_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."submission_verifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_first_reviewer_user_id_users_id_fk" FOREIGN KEY ("first_reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "feedback_snippets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"locale" text NOT NULL,
	"body" text NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_snippets_locale" CHECK ("locale" in ('rw', 'en')),
	CONSTRAINT "feedback_snippets_body" CHECK (char_length(btrim("body")) between 1 and 280)
);--> statement-breakpoint
ALTER TABLE "feedback_snippets" ADD CONSTRAINT "feedback_snippets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "feedback_snippets" ("locale", "body")
SELECT 'en', 'Name the page you used.'
WHERE NOT EXISTS (
	SELECT 1 FROM "feedback_snippets" WHERE "body" = 'Name the page you used.'
);--> statement-breakpoint
INSERT INTO "feedback_snippets" ("locale", "body")
SELECT 'rw', 'Vuga urupapuro wakoresheje.'
WHERE NOT EXISTS (
	SELECT 1 FROM "feedback_snippets" WHERE "body" = 'Vuga urupapuro wakoresheje.'
);--> statement-breakpoint
INSERT INTO "feedback_snippets" ("locale", "body")
SELECT 'en', 'The photo does not show the task.'
WHERE NOT EXISTS (
	SELECT 1 FROM "feedback_snippets" WHERE "body" = 'The photo does not show the task.'
);--> statement-breakpoint
INSERT INTO "feedback_snippets" ("locale", "body")
SELECT 'rw', 'Ifoto ntiragaragaza umurimo.'
WHERE NOT EXISTS (
	SELECT 1 FROM "feedback_snippets" WHERE "body" = 'Ifoto ntiragaragaza umurimo.'
);--> statement-breakpoint
INSERT INTO "feedback_snippets" ("locale", "body")
SELECT 'en', 'Send the missing part.'
WHERE NOT EXISTS (
	SELECT 1 FROM "feedback_snippets" WHERE "body" = 'Send the missing part.'
);--> statement-breakpoint
INSERT INTO "feedback_snippets" ("locale", "body")
SELECT 'rw', 'Ohereza igice kibura.'
WHERE NOT EXISTS (
	SELECT 1 FROM "feedback_snippets" WHERE "body" = 'Ohereza igice kibura.'
);
