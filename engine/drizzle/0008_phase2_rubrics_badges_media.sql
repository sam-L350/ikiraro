ALTER TABLE "badges" ADD COLUMN "title_en" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "badges" ADD COLUMN "title_rw" text;--> statement-breakpoint
ALTER TABLE "badges" ADD COLUMN "level" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "badges" ADD COLUMN "rule" jsonb DEFAULT '{"allRequiredTasksApproved":true,"minimumScore":null,"minimumHours":null}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rubric_criteria" ADD COLUMN "pass_threshold" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "pass_threshold" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "image_key" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "audio_key" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "job_aid_key" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "outbound_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "badges_course" ON "badges" USING btree ("course_id");--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_level" CHECK ("badges"."level" > 0);--> statement-breakpoint
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_pass_threshold" CHECK ("rubric_criteria"."pass_threshold" between 1 and 100);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_pass_threshold" CHECK ("tasks"."pass_threshold" between 1 and 100);