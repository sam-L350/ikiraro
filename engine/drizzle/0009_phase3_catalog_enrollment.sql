CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"course_id" uuid NOT NULL,
	"content_version_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	"enrolled_by_user_id" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "category" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "economic_sector" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "level" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_center_id_learning_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."learning_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_enrolled_by_user_id_users_id_fk" FOREIGN KEY ("enrolled_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_user_course" ON "enrollments" USING btree ("user_id","course_id");--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_level" CHECK ("courses"."level" > 0);--> statement-breakpoint
INSERT INTO "permissions" ("code", "description")
SELECT 'learning.read', 'Read the published course catalog'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'learning.read');--> statement-breakpoint
INSERT INTO "permissions" ("code", "description")
SELECT 'learning.enroll', 'Enroll in a published course'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'learning.enroll');--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r
JOIN "permissions" p ON p.code IN ('learning.read', 'learning.enroll')
WHERE r.code IN ('learner', 'trainer', 'center_manager')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;