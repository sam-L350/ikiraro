CREATE TABLE "task_clarity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"rating" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_clarity_rating" CHECK ("task_clarity"."rating" in ('clear', 'hard'))
);
--> statement-breakpoint
ALTER TABLE "task_clarity" ADD CONSTRAINT "task_clarity_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_clarity" ADD CONSTRAINT "task_clarity_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_clarity_enrollment_task" ON "task_clarity" USING btree ("enrollment_id","task_id");