CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"event_name" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_channel" CHECK ("notification_preferences"."channel" in ('in_app', 'sms', 'email'))
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_name" text NOT NULL,
	"channel" text NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"updated_by_user_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_templates_channel" CHECK ("notification_templates"."channel" in ('in_app', 'sms', 'email')),
	CONSTRAINT "notification_templates_locale" CHECK ("notification_templates"."locale" in ('rw', 'en')),
	CONSTRAINT "notification_templates_title" CHECK (char_length(btrim("notification_templates"."title")) > 0 and char_length("notification_templates"."title") <= 120),
	CONSTRAINT "notification_templates_body" CHECK (char_length(btrim("notification_templates"."body")) > 0 and char_length("notification_templates"."body") <= 500)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"event_id" uuid,
	"event_name" text NOT NULL,
	"channel" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_channel" CHECK ("notifications"."channel" in ('in_app', 'sms', 'email')),
	CONSTRAINT "notifications_status" CHECK ("notifications"."status" in ('queued', 'sent', 'failed')),
	CONSTRAINT "notifications_attempts" CHECK ("notifications"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_domain_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."domain_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_slot" ON "notification_preferences" USING btree ("user_id","event_name","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_templates_slot" ON "notification_templates" USING btree ("event_name","channel","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_event_user_channel" ON "notifications" USING btree ("event_id","user_id","channel","event_name");