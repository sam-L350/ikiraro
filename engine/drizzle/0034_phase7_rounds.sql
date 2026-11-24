CREATE TABLE "allocation_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"district_id" uuid NOT NULL,
	"title" text NOT NULL,
	"quantity" integer NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"opened_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocation_rounds_title" CHECK (char_length(btrim("title")) between 1 and 120),
	CONSTRAINT "allocation_rounds_quantity" CHECK ("quantity" between 1 and 1000),
	CONSTRAINT "allocation_rounds_window" CHECK ("closes_at" > "opens_at")
);--> statement-breakpoint
CREATE INDEX "allocation_rounds_district" ON "allocation_rounds" USING btree ("district_id", "opens_at");--> statement-breakpoint
ALTER TABLE "allocation_rounds" ADD CONSTRAINT "allocation_rounds_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_rounds" ADD CONSTRAINT "allocation_rounds_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "round_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"statement" text NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_applications_statement" CHECK (char_length(btrim("statement")) between 1 and 400)
);--> statement-breakpoint
CREATE UNIQUE INDEX "round_applications_learner" ON "round_applications" USING btree ("round_id", "user_id");--> statement-breakpoint
CREATE INDEX "round_applications_round" ON "round_applications" USING btree ("round_id", "created_at");--> statement-breakpoint
ALTER TABLE "round_applications" ADD CONSTRAINT "round_applications_round_id_allocation_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."allocation_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_applications" ADD CONSTRAINT "round_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
