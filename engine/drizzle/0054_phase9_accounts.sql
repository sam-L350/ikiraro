CREATE TABLE "login_locks" (
	"subject" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone,
	CONSTRAINT "login_locks_failures" CHECK ("failures" >= 0)
);
--> statement-breakpoint
CREATE TABLE "staff_factors" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "staff_factors_secret" CHECK (char_length("secret") between 16 and 64)
);
--> statement-breakpoint
CREATE TABLE "account_merge_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keep_user_id" integer NOT NULL,
	"drop_user_id" integer NOT NULL,
	"reason" text NOT NULL,
	"requested_by_user_id" integer NOT NULL,
	"decided_by_user_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "account_merge_requests_pair" CHECK ("keep_user_id" <> "drop_user_id"),
	CONSTRAINT "account_merge_requests_reason" CHECK (char_length(btrim("reason")) between 1 and 400),
	CONSTRAINT "account_merge_requests_status" CHECK ("status" in ('pending', 'approved', 'declined')),
	CONSTRAINT "account_merge_requests_decision" CHECK ((
		"status" = 'pending'
		and "decided_by_user_id" is null
		and "decision_note" is null
		and "decided_at" is null
	) or (
		"status" = 'approved'
		and "decided_by_user_id" is not null
		and "decided_by_user_id" <> "requested_by_user_id"
		and "decision_note" is null
		and "decided_at" is not null
	) or (
		"status" = 'declined'
		and "decided_by_user_id" is not null
		and "decided_by_user_id" <> "requested_by_user_id"
		and "decision_note" is not null
		and char_length(btrim("decision_note")) between 1 and 400
		and "decided_at" is not null
	))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_merge_requests_pending" ON "account_merge_requests" ("keep_user_id", "drop_user_id") WHERE "status" = 'pending';
--> statement-breakpoint
CREATE TABLE "account_merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"keep_user_id" integer NOT NULL,
	"drop_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "account_merges_request" UNIQUE ("request_id")
);
--> statement-breakpoint
CREATE TABLE "retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_days" integer NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "retention_policies_days" CHECK ("evidence_days" between 0 and 3650)
);
--> statement-breakpoint
ALTER TABLE "login_locks" ADD CONSTRAINT "login_locks_subject_not_blank" CHECK (char_length("subject") between 1 and 400);
--> statement-breakpoint
ALTER TABLE "staff_factors" ADD CONSTRAINT "staff_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account_merge_requests" ADD CONSTRAINT "account_merge_requests_keep_user_id_users_id_fk" FOREIGN KEY ("keep_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account_merge_requests" ADD CONSTRAINT "account_merge_requests_drop_user_id_users_id_fk" FOREIGN KEY ("drop_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account_merge_requests" ADD CONSTRAINT "account_merge_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account_merge_requests" ADD CONSTRAINT "account_merge_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account_merges" ADD CONSTRAINT "account_merges_request_id_account_merge_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."account_merge_requests"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account_merges" ADD CONSTRAINT "account_merges_keep_user_id_users_id_fk" FOREIGN KEY ("keep_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account_merges" ADD CONSTRAINT "account_merges_drop_user_id_users_id_fk" FOREIGN KEY ("drop_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP TRIGGER IF EXISTS account_merges_append_only ON account_merges;
--> statement-breakpoint
CREATE TRIGGER account_merges_append_only
BEFORE UPDATE OR DELETE ON account_merges
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS retention_policies_append_only ON retention_policies;
--> statement-breakpoint
CREATE TRIGGER retention_policies_append_only
BEFORE UPDATE OR DELETE ON retention_policies
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
