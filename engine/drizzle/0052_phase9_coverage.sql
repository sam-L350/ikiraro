CREATE TABLE "popup_tours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place" text NOT NULL,
	"home_center_id" uuid NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "popup_tours_place" CHECK (char_length(btrim("place")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "popup_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tour_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"minutes" integer NOT NULL,
	"capacity" integer NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "popup_sessions_topic" CHECK (char_length(btrim("topic")) between 1 and 120),
	CONSTRAINT "popup_sessions_minutes" CHECK ("minutes" between 15 and 480),
	CONSTRAINT "popup_sessions_capacity" CHECK ("capacity" between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "popup_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "popup_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"marked_by_user_id" integer NOT NULL,
	"marked_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "popup_home_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tour_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"center_id" uuid NOT NULL,
	"linked_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"title_en" text NOT NULL,
	"title_rw" text,
	"instructions_en" text,
	"instructions_rw" text,
	"evidence_type" text,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "content_templates_name" CHECK (char_length(btrim("name")) between 1 and 80),
	CONSTRAINT "content_templates_title_en" CHECK (char_length(btrim("title_en")) between 1 and 120),
	CONSTRAINT "content_templates_title_rw" CHECK ("title_rw" is null or char_length(btrim("title_rw")) between 1 and 120),
	CONSTRAINT "content_templates_instructions_en" CHECK ("instructions_en" is null or char_length("instructions_en") <= 2000),
	CONSTRAINT "content_templates_instructions_rw" CHECK ("instructions_rw" is null or char_length("instructions_rw") <= 2000),
	CONSTRAINT "content_templates_evidence" CHECK ("evidence_type" is null or "evidence_type" in ('photo', 'file', 'note'))
);
--> statement-breakpoint
CREATE INDEX "popup_tours_center" ON "popup_tours" USING btree ("home_center_id");
--> statement-breakpoint
CREATE INDEX "popup_sessions_tour" ON "popup_sessions" USING btree ("tour_id","starts_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "popup_signups_once" ON "popup_signups" USING btree ("session_id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "popup_attendance_once" ON "popup_attendance" USING btree ("session_id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "popup_home_links_once" ON "popup_home_links" USING btree ("tour_id","user_id");
--> statement-breakpoint
ALTER TABLE "popup_tours" ADD CONSTRAINT "popup_tours_home_center_id_fk" FOREIGN KEY ("home_center_id") REFERENCES "public"."learning_centers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "popup_tours" ADD CONSTRAINT "popup_tours_created_by_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "popup_sessions" ADD CONSTRAINT "popup_sessions_tour_id_fk" FOREIGN KEY ("tour_id") REFERENCES "public"."popup_tours"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "popup_sessions" ADD CONSTRAINT "popup_sessions_created_by_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "popup_signups" ADD CONSTRAINT "popup_signups_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."popup_sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "popup_signups" ADD CONSTRAINT "popup_signups_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "popup_attendance" ADD CONSTRAINT "popup_attendance_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."popup_sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "popup_attendance" ADD CONSTRAINT "popup_attendance_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "popup_attendance" ADD CONSTRAINT "popup_attendance_marked_by_user_id_fk" FOREIGN KEY ("marked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "popup_home_links" ADD CONSTRAINT "popup_home_links_tour_id_fk" FOREIGN KEY ("tour_id") REFERENCES "public"."popup_tours"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "popup_home_links" ADD CONSTRAINT "popup_home_links_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "popup_home_links" ADD CONSTRAINT "popup_home_links_center_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."learning_centers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "popup_home_links" ADD CONSTRAINT "popup_home_links_linked_by_user_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_templates" ADD CONSTRAINT "content_templates_created_by_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP TRIGGER IF EXISTS popup_tours_append_only ON popup_tours;
--> statement-breakpoint
CREATE TRIGGER popup_tours_append_only
BEFORE UPDATE OR DELETE ON popup_tours
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS popup_sessions_append_only ON popup_sessions;
--> statement-breakpoint
CREATE TRIGGER popup_sessions_append_only
BEFORE UPDATE OR DELETE ON popup_sessions
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS popup_signups_append_only ON popup_signups;
--> statement-breakpoint
CREATE TRIGGER popup_signups_append_only
BEFORE UPDATE OR DELETE ON popup_signups
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS popup_attendance_append_only ON popup_attendance;
--> statement-breakpoint
CREATE TRIGGER popup_attendance_append_only
BEFORE UPDATE OR DELETE ON popup_attendance
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS popup_home_links_append_only ON popup_home_links;
--> statement-breakpoint
CREATE TRIGGER popup_home_links_append_only
BEFORE UPDATE OR DELETE ON popup_home_links
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS content_templates_append_only ON content_templates;
--> statement-breakpoint
CREATE TRIGGER content_templates_append_only
BEFORE UPDATE OR DELETE ON content_templates
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
