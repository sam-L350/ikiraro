CREATE TABLE "module_prerequisites" (
	"module_id" uuid NOT NULL,
	"required_module_id" uuid NOT NULL,
	CONSTRAINT "module_prerequisites_not_self" CHECK ("module_prerequisites"."module_id" <> "module_prerequisites"."required_module_id")
);
--> statement-breakpoint
CREATE TABLE "module_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "module_progress_status" CHECK ("module_progress"."status" in ('started', 'complete'))
);
--> statement-breakpoint
CREATE TABLE "task_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "task_progress_status" CHECK ("task_progress"."status" in ('started', 'complete'))
);
--> statement-breakpoint
ALTER TABLE "module_prerequisites" ADD CONSTRAINT "module_prerequisites_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_prerequisites" ADD CONSTRAINT "module_prerequisites_required_module_id_modules_id_fk" FOREIGN KEY ("required_module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_progress" ADD CONSTRAINT "module_progress_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_progress" ADD CONSTRAINT "module_progress_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_progress" ADD CONSTRAINT "task_progress_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_progress" ADD CONSTRAINT "task_progress_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "module_prerequisites_pair" ON "module_prerequisites" USING btree ("module_id","required_module_id");--> statement-breakpoint
CREATE UNIQUE INDEX "module_progress_enrollment_module" ON "module_progress" USING btree ("enrollment_id","module_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_progress_enrollment_task" ON "task_progress" USING btree ("enrollment_id","task_id");--> statement-breakpoint
INSERT INTO "permissions" ("code", "description")
SELECT 'learning.progress', 'Read progress on an enrolled course'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'learning.progress');--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r
JOIN "permissions" p ON p.code = 'learning.progress'
WHERE r.code IN ('learner', 'trainer', 'center_manager')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;