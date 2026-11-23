CREATE TABLE "task_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"content_version_id" uuid NOT NULL,
	"owner_user_id" integer NOT NULL,
	"attempt" integer NOT NULL,
	"status" text NOT NULL,
	"evidence_type" text NOT NULL,
	"media_object_id" uuid,
	"object_key" text,
	"content_hash" text,
	"note" text,
	"device_info" text,
	"geo_lat" double precision,
	"geo_lng" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "task_submissions_status" CHECK ("task_submissions"."status" in ('draft', 'pending', 'in_review', 'approved', 'needs_revision', 'rejected', 'escalated', 'withdrawn')),
	CONSTRAINT "task_submissions_attempt_positive" CHECK ("task_submissions"."attempt" > 0),
	CONSTRAINT "task_submissions_evidence" CHECK ("task_submissions"."evidence_type" in ('photo', 'file', 'note'))
);
--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_media_object_id_media_objects_id_fk" FOREIGN KEY ("media_object_id") REFERENCES "public"."media_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_submissions_attempt" ON "task_submissions" USING btree ("enrollment_id","task_id","attempt");--> statement-breakpoint
CREATE UNIQUE INDEX "task_submissions_one_open" ON "task_submissions" USING btree ("enrollment_id","task_id") WHERE "task_submissions"."status" in ('draft', 'pending', 'in_review');