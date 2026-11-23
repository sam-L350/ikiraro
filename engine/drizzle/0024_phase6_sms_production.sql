CREATE TABLE "sms_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer,
	"center_id" uuid,
	"notification_id" uuid,
	"provider" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"currency" text DEFAULT 'RWF' NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "sms_charges_status" CHECK ("sms_charges"."status" in ('accepted', 'delivered', 'failed')),
	CONSTRAINT "sms_charges_amount" CHECK ("sms_charges"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_status";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "sms_charges" ADD CONSTRAINT "sms_charges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_charges" ADD CONSTRAINT "sms_charges_center_id_learning_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."learning_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_charges" ADD CONSTRAINT "sms_charges_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sms_charges_provider_message" ON "sms_charges" USING btree ("provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_provider_message" ON "notifications" USING btree ("provider_message_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_status" CHECK ("notifications"."status" in ('queued', 'submitted', 'sent', 'failed'));