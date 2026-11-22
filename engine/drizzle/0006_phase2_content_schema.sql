CREATE TABLE "badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"published_by_user_id" integer,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_versions_number" CHECK ("content_versions"."version_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "course_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	CONSTRAINT "course_translations_locale" CHECK ("course_translations"."locale" in ('rw', 'en'))
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_user_id" integer,
	"published_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_status" CHECK ("courses"."status" in ('draft', 'in_review', 'published', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "module_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	CONSTRAINT "module_translations_locale" CHECK ("module_translations"."locale" in ('rw', 'en'))
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modules_status" CHECK ("modules"."status" in ('draft', 'in_review', 'published', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "rubric_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"weight" integer NOT NULL,
	"prompt_rw" text,
	"prompt_en" text,
	CONSTRAINT "rubric_criteria_weight" CHECK ("rubric_criteria"."weight" > 0)
);
--> statement-breakpoint
CREATE TABLE "task_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	CONSTRAINT "task_translations_locale" CHECK ("task_translations"."locale" in ('rw', 'en'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"evidence_type" text,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_status" CHECK ("tasks"."status" in ('draft', 'in_review', 'published', 'retired'))
);
--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_translations" ADD CONSTRAINT "course_translations_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_translations" ADD CONSTRAINT "module_translations_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_translations" ADD CONSTRAINT "task_translations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_versions_course_number" ON "content_versions" USING btree ("course_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "course_translations_course_locale" ON "course_translations" USING btree ("course_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "module_translations_module_locale" ON "module_translations" USING btree ("module_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "modules_course_position" ON "modules" USING btree ("course_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "rubric_criteria_task_position" ON "rubric_criteria" USING btree ("task_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "task_translations_task_locale" ON "task_translations" USING btree ("task_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_module_position" ON "tasks" USING btree ("module_id","position");