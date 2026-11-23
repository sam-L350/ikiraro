CREATE TABLE "point_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_user_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"requested_by_user_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" integer,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "point_adjustments_amount" CHECK ("point_adjustments"."amount" <> 0 and "point_adjustments"."amount" between -1000000 and 1000000),
	CONSTRAINT "point_adjustments_reason" CHECK (char_length(btrim("point_adjustments"."reason")) > 0 and char_length("point_adjustments"."reason") <= 500),
	CONSTRAINT "point_adjustments_status" CHECK ("point_adjustments"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "point_adjustments_decision" CHECK ((
				"point_adjustments"."status" = 'pending'
				and "point_adjustments"."decided_by_user_id" is null
				and "point_adjustments"."decided_at" is null
			) or (
				"point_adjustments"."status" <> 'pending'
				and "point_adjustments"."decided_by_user_id" is not null
				and "point_adjustments"."decided_at" is not null
				and "point_adjustments"."decided_by_user_id" <> "point_adjustments"."requested_by_user_id"
			)),
	CONSTRAINT "point_adjustments_reject_note" CHECK ("point_adjustments"."status" <> 'rejected' or (
				"point_adjustments"."decision_note" is not null
				and char_length(btrim("point_adjustments"."decision_note")) > 0
			))
);
--> statement-breakpoint
ALTER TABLE "point_transactions" DROP CONSTRAINT "point_transactions_amount";--> statement-breakpoint
ALTER TABLE "point_transactions" ADD COLUMN "approved_by" integer;--> statement-breakpoint
ALTER TABLE "point_adjustments" ADD CONSTRAINT "point_adjustments_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_adjustments" ADD CONSTRAINT "point_adjustments_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_adjustments" ADD CONSTRAINT "point_adjustments_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_amount" CHECK ("point_transactions"."kind" in ('reversal', 'manual_adjustment') or "point_transactions"."amount" >= 0);