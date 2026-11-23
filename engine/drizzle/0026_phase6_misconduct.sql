CREATE TABLE "reports_misconduct" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" integer NOT NULL,
	"reporter_center_id" uuid NOT NULL,
	"accused_center_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_note" text,
	"closed_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "reports_misconduct_kind" CHECK ("reports_misconduct"."kind" in ('misconduct', 'bribery', 'favoritism')),
	CONSTRAINT "reports_misconduct_status" CHECK ("reports_misconduct"."status" in ('open', 'closed')),
	CONSTRAINT "reports_misconduct_body" CHECK (char_length(btrim("reports_misconduct"."body")) between 1 and 2000),
	CONSTRAINT "reports_misconduct_closed" CHECK ((
		"reports_misconduct"."status" = 'open'
		and "reports_misconduct"."closed_note" is null
		and "reports_misconduct"."closed_by_user_id" is null
		and "reports_misconduct"."closed_at" is null
	) or (
		"reports_misconduct"."status" = 'closed'
		and "reports_misconduct"."closed_note" is not null
		and char_length(btrim("reports_misconduct"."closed_note")) between 1 and 500
		and "reports_misconduct"."closed_by_user_id" is not null
		and "reports_misconduct"."closed_at" is not null
	))
);
--> statement-breakpoint
ALTER TABLE "reports_misconduct" ADD CONSTRAINT "reports_misconduct_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports_misconduct" ADD CONSTRAINT "reports_misconduct_reporter_center_id_learning_centers_id_fk" FOREIGN KEY ("reporter_center_id") REFERENCES "public"."learning_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports_misconduct" ADD CONSTRAINT "reports_misconduct_accused_center_id_learning_centers_id_fk" FOREIGN KEY ("accused_center_id") REFERENCES "public"."learning_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports_misconduct" ADD CONSTRAINT "reports_misconduct_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_misconduct_reporter" ON "reports_misconduct" USING btree ("reporter_user_id");--> statement-breakpoint
CREATE INDEX "reports_misconduct_accused" ON "reports_misconduct" USING btree ("accused_center_id","status");
