ALTER TABLE "courses" ADD COLUMN "reviewed_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "published_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;