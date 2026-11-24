CREATE TABLE "center_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"course_id" uuid,
	"topic" text NOT NULL,
	"trainer_user_id" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"minutes" integer NOT NULL,
	"capacity" integer NOT NULL,
	"check_in_token" text NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "center_sessions_topic" CHECK (char_length(btrim("topic")) between 1 and 120),
	CONSTRAINT "center_sessions_minutes" CHECK ("minutes" between 15 and 480),
	CONSTRAINT "center_sessions_capacity" CHECK ("capacity" between 1 and 500)
);--> statement-breakpoint
CREATE UNIQUE INDEX "center_sessions_token" ON "center_sessions" USING btree ("check_in_token");--> statement-breakpoint
CREATE INDEX "center_sessions_center_start" ON "center_sessions" USING btree ("center_id", "starts_at");--> statement-breakpoint
ALTER TABLE "center_sessions" ADD CONSTRAINT "center_sessions_center_id_learning_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."learning_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "center_sessions" ADD CONSTRAINT "center_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "center_sessions" ADD CONSTRAINT "center_sessions_trainer_user_id_users_id_fk" FOREIGN KEY ("trainer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "center_sessions" ADD CONSTRAINT "center_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "session_attendance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"learner_user_id" integer NOT NULL,
	"method" text NOT NULL,
	"minutes" integer NOT NULL,
	"marked_by_user_id" integer NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_attendance_method" CHECK ("method" in ('tick', 'qr')),
	CONSTRAINT "session_attendance_minutes" CHECK ("minutes" between 15 and 480)
);--> statement-breakpoint
CREATE UNIQUE INDEX "session_attendance_once" ON "session_attendance" USING btree ("session_id", "learner_user_id");--> statement-breakpoint
CREATE INDEX "session_attendance_learner" ON "session_attendance" USING btree ("learner_user_id");--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_session_id_center_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."center_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_marked_by_user_id_users_id_fk" FOREIGN KEY ("marked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
