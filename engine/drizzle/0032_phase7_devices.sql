CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"condition" text NOT NULL,
	"availability" text NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_kind" CHECK ("kind" in ('computer', 'tablet', 'router')),
	CONSTRAINT "devices_label" CHECK (char_length(btrim("label")) between 1 and 80),
	CONSTRAINT "devices_condition" CHECK ("condition" in ('good', 'worn', 'broken')),
	CONSTRAINT "devices_availability" CHECK ("availability" in ('available', 'in_use', 'unavailable'))
);--> statement-breakpoint
CREATE INDEX "devices_center" ON "devices" USING btree ("center_id");--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_center_id_learning_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."learning_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "device_bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"learner_user_id" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_bookings_minutes" CHECK ("minutes" between 30 and 180)
);--> statement-breakpoint
CREATE INDEX "device_bookings_device_start" ON "device_bookings" USING btree ("device_id", "starts_at");--> statement-breakpoint
ALTER TABLE "device_bookings" ADD CONSTRAINT "device_bookings_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_bookings" ADD CONSTRAINT "device_bookings_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
