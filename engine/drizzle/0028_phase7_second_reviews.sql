CREATE TABLE "second_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verification_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"first_reviewer_user_id" integer NOT NULL,
	"second_reviewer_user_id" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "second_reviews_verification_id_unique" UNIQUE ("verification_id"),
	CONSTRAINT "second_reviews_status" CHECK ("status" in ('open', 'agreed', 'disagreed')),
	CONSTRAINT "second_reviews_shape" CHECK ((
		"status" = 'open'
		and "second_reviewer_user_id" is null
		and "note" is null
		and "decided_at" is null
	) or (
		"status" in ('agreed', 'disagreed')
		and "second_reviewer_user_id" is not null
		and "second_reviewer_user_id" <> "first_reviewer_user_id"
		and "note" is not null
		and char_length(btrim("note")) between 1 and 500
		and "decided_at" is not null
	))
);--> statement-breakpoint
ALTER TABLE "second_reviews" ADD CONSTRAINT "second_reviews_verification_id_submission_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."submission_verifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "second_reviews" ADD CONSTRAINT "second_reviews_submission_id_task_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "second_reviews" ADD CONSTRAINT "second_reviews_first_reviewer_user_id_users_id_fk" FOREIGN KEY ("first_reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "second_reviews" ADD CONSTRAINT "second_reviews_second_reviewer_user_id_users_id_fk" FOREIGN KEY ("second_reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "second_reviews_waiting" ON "second_reviews" USING btree ("created_at") WHERE "status" = 'open';--> statement-breakpoint
INSERT INTO "config_settings" ("key", "value", "version")
SELECT 'review.second_every', '5'::jsonb, 1
WHERE NOT EXISTS (
	SELECT 1 FROM "config_settings" WHERE "key" = 'review.second_every'
);--> statement-breakpoint
INSERT INTO "config_settings" ("key", "value", "version")
SELECT 'review.second_new_every', '2'::jsonb, 1
WHERE NOT EXISTS (
	SELECT 1 FROM "config_settings" WHERE "key" = 'review.second_new_every'
);--> statement-breakpoint
INSERT INTO "config_settings" ("key", "value", "version")
SELECT 'review.new_trainer_approvals', '10'::jsonb, 1
WHERE NOT EXISTS (
	SELECT 1 FROM "config_settings" WHERE "key" = 'review.new_trainer_approvals'
);--> statement-breakpoint
INSERT INTO "config_settings" ("key", "value", "version")
SELECT 'points.fast_days', '7'::jsonb, 1
WHERE NOT EXISTS (
	SELECT 1 FROM "config_settings" WHERE "key" = 'points.fast_days'
);--> statement-breakpoint
INSERT INTO "config_settings" ("key", "value", "version")
SELECT 'points.fast_amount', '100'::jsonb, 1
WHERE NOT EXISTS (
	SELECT 1 FROM "config_settings" WHERE "key" = 'points.fast_amount'
);--> statement-breakpoint
INSERT INTO "config_settings" ("key", "value", "version")
SELECT 'review.single_reviewer_min', '3'::jsonb, 1
WHERE NOT EXISTS (
	SELECT 1 FROM "config_settings" WHERE "key" = 'review.single_reviewer_min'
);
